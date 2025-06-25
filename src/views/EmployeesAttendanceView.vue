<script setup lang="ts">
import { useSupabaseAttendanceStore } from '../stores/supabaseAttendance'
import { ref, computed, onMounted, watch } from 'vue'
import type { AttendanceRecord } from '../lib/supabase'
import { useRoute } from 'vue-router'

const store = useSupabaseAttendanceStore()
const route = useRoute()

// 날짜 선택
const getDefaultStartDate = () => {
  const today = new Date()
  const currentMonth = today.getMonth()
  const currentYear = today.getFullYear()
  
  // 이전 달 21일부터
  const lastMonth = currentMonth === 0 ? 11 : currentMonth - 1
  const lastYear = currentMonth === 0 ? currentYear - 1 : currentYear
  return new Date(lastYear, lastMonth, 22).toISOString().split('T')[0]
}

const getDefaultEndDate = () => {
  const today = new Date()
  const currentMonth = today.getMonth()
  const currentYear = today.getFullYear()
  
  // 현재 달 20일까지
  return new Date(currentYear, currentMonth, 21).toISOString().split('T')[0]
}

const startDate = ref(getDefaultStartDate())
const endDate = ref(getDefaultEndDate())

// 선택된 직원
const selectedEmployeeId = ref('')

// 로딩 상태
const loading = ref(false)

// 공휴일 목록 (향후 API로 자동 가져오도록 개선 예정)
const holidays = ref<string[]>([])

// 공휴일 데이터 가져오기
const fetchHolidays = async (year: number) => {
  try {
    // 타임아웃 설정 (5초)
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 5000)
    
    const response = await fetch(`https://holidays-jp.github.io/api/v1/${year}/date.json`, {
      signal: controller.signal
    })
    
    clearTimeout(timeoutId)
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }
    
    const data = await response.json()
    if (data && typeof data === 'object') {
      holidays.value = Object.keys(data)
    } else {
      throw new Error('Invalid data format')
    }
  } catch (error) {
    console.error('공휴일 데이터 가져오기 실패:', error)
    // API 실패 시 기본 공휴일 사용
    holidays.value = [
      `${year}-01-01`, // 신정
      `${year}-02-11`, // 건국기념일
      `${year}-02-23`, // 천황탄생일
      `${year}-04-29`, // 쇼와의 날
      `${year}-05-03`, // 헌법기념일
      `${year}-05-04`, // 녹색의 날
      `${year}-05-05`, // 어린이날
      `${year}-08-11`, // 산의 날
      `${year}-11-03`, // 문화의 날
      `${year}-11-23`, // 노동감사의 날
      `${year}-12-23`, // 천황탄생일
    ]
  }
}


onMounted(async () => {
  try {
    await store.initialize()
    // 현재 연도의 공휴일 가져오기
    const currentYear = new Date().getFullYear()
    await fetchHolidays(currentYear)
    
    // 쿼리 파라미터에서 직원 ID 확인
    const employeeIdFromQuery = route.query.employeeId as string
    if (employeeIdFromQuery) {
      selectedEmployeeId.value = employeeIdFromQuery
    }
  } catch (error) {
    console.error('페이지 초기화 중 에러 발생:', error)
    loading.value = false
  }
})

// 선택된 기간의 기록 조회
const selectedPeriodRecords = computed(() => {
  if (!selectedEmployeeId.value) return []
  
  return store.attendanceRecords.filter(record => 
    record.employee_id === selectedEmployeeId.value &&
    record.date >= startDate.value &&
    record.date <= endDate.value
  ).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
})

// 선택된 직원 정보
const selectedEmployee = computed(() => {
  return store.getEmployeeById(selectedEmployeeId.value)
})

// 휴일 여부 확인 (주말 + 공휴일)
const isHoliday = (dateString: string) => {
  const date = new Date(dateString)
  const isWeekend = date.getDay() === 0 // 일요일(0) 또는 토요일(6)
  const isPublicHoliday = holidays.value.includes(dateString)
  
  return isWeekend || isPublicHoliday
}

// 공휴일 여부 확인
const isPublicHoliday = (dateString: string) => {
  return holidays.value.includes(dateString)
}

// 근무 통계 계산
const workStats = computed(() => {
  const records = selectedPeriodRecords.value
  let totalWorkHours = 0
  let holidayWorkHours = 0
  let breakTimeHours = 0
  let workDays = 0
  let holidayDays = 0

  records.forEach(record => {
    if (record.check_in && record.check_out && record.total_hours) {
      const isHolidayWork = isHoliday(record.date)
      
      totalWorkHours += record.total_hours
      workDays++
      
      if (isHolidayWork) {
        holidayWorkHours += record.total_hours
        holidayDays++
      }
      
      // 휴게시간 계산 (8시간 이상 근무 시 1시간 휴게)
      if (record.total_hours >= 8) {
        breakTimeHours += 1
      } else if (record.total_hours >= 6) {
        breakTimeHours += 0.5
      }
    }
  })

  return {
    totalWorkHours: Math.round(totalWorkHours * 100) / 100,
    holidayWorkHours: Math.round(holidayWorkHours * 100) / 100,
    breakTimeHours: Math.round(breakTimeHours * 100) / 100,
    workDays,
    holidayDays,
    totalDays: workDays + holidayDays
  }
})

// 날짜 형식 변환
const formatDate = (dateString: string) => {
  const date = new Date(dateString)
  return date.toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long'
  })
}

// 시간 형식 변환
const formatTime = (timeString: string | null) => {
  if (!timeString) return '-'
  
  const timeParts = timeString.split(':')
  if (timeParts.length >= 2) {
    return `${timeParts[0]}:${timeParts[1]}`
  }
  return timeString
}

// 요일 확인
const getDayOfWeek = (dateString: string) => {
  const date = new Date(dateString)
  const days = ['日', '月', '火', '水', '木', '金', '土']
  return days[date.getDay()]
}

// 휴일 타입 확인
const getHolidayType = (dateString: string) => {
  if (isPublicHoliday(dateString)) {
    return '祝日'
  }
  const date = new Date(dateString)
  if (date.getDay() === 0) return '日曜'
  if (date.getDay() === 6) return '土曜'
  return ''
}

// 근무 상태 텍스트
const getWorkStatusText = (record: AttendanceRecord) => {
  if (!record.check_in) return '未出勤'
  if (!record.check_out) return '出勤中'
  return record.status === 'late' ? '遅刻' : 
         record.status === 'early-leave' ? '早退' : '正常'
}

// 근무 상태 색상
const getWorkStatusColor = (record: AttendanceRecord) => {
  if (!record.check_in) return '#95a5a6'
  if (!record.check_out) return '#3498db'
  return record.status === 'late' ? '#e74c3c' : 
         record.status === 'early-leave' ? '#f39c12' : '#27ae60'
}

// 시간 차이 계산 (분 단위)
const getTimeDifference = (expectedTime: string | null, actualTime: string | null) => {
  if (!expectedTime || !actualTime) return 0
  
  const expected = new Date(`2000-01-01T${expectedTime}`)
  const actual = new Date(`2000-01-01T${actualTime}`)
  
  return Math.abs(actual.getTime() - expected.getTime()) / (1000 * 60)
}

// 시간 차이를 텍스트로 표시
const getTimeDifferenceText = (expectedTime: string | null, actualTime: string | null) => {
  if (!expectedTime || !actualTime) return ''
  
  const diff = getTimeDifference(expectedTime, actualTime)
  if (diff < 30) return ''
  
  const hours = Math.floor(diff / 60)
  const minutes = diff % 60
  
  if (hours > 0) {
    return `${hours}時間${minutes}分`
  } else {
    return `${minutes}分`
  }
}

// 출근 시간 차이 텍스트
const getCheckInDifferenceText = (record: AttendanceRecord) => {
  return getTimeDifferenceText(record.scheduled_check_in, record.check_in)
}

// 퇴근 시간 차이 텍스트
const getCheckOutDifferenceText = (record: AttendanceRecord) => {
  return getTimeDifferenceText(record.scheduled_check_out, record.check_out)
}

// 출근 시간 차이 확인 (30분 이상 차이나면 true)
const isCheckInTimeDifferent = (record: AttendanceRecord) => {
  const diff = getTimeDifference(record.scheduled_check_in, record.check_in)
  return diff >= 30
}

// 퇴근 시간 차이 확인 (30분 이상 차이나면 true)
const isCheckOutTimeDifferent = (record: AttendanceRecord) => {
  const diff = getTimeDifference(record.scheduled_check_out, record.check_out)
  return diff >= 30
}
</script>

<template>
  <div class="employees-info-page">
    <!-- 페이지 헤더 -->
    <div class="page-header">
      <h1>従業員勤務記録表</h1>
      <div class="current-time">
        {{ new Date().toLocaleDateString('ja-JP') }}
      </div>
    </div>

    <!-- 로딩 상태 -->
    <div v-if="store.loading || loading" class="loading-overlay">
      <div class="loading-spinner"></div>
      <p>データを読み込み中...</p>
    </div>

    <!-- 에러 메시지 -->
    <div v-if="store.error" class="error-message">
      {{ store.error }}
    </div>

    <!-- 직원 선택 및 기간 설정 -->
    <div class="control-section">
      <div class="employee-selector">
        <label for="employee-select">従業員選択:</label>
        <select 
          id="employee-select" 
          v-model="selectedEmployeeId"
          class="employee-select"
        >
          <option value="">従業員を選択してください</option>
          <option 
            v-for="employee in store.activeEmployees" 
            :key="employee.id" 
            :value="employee.id"
          >
            {{ employee.employee_code }} - {{ employee.last_name }}{{ employee.first_name }} ({{ employee.department }})
          </option>
        </select>
      </div>

      <div class="date-range-selector">
        <div class="date-input">
          <label for="start-date">開始日:</label>
          <input 
            id="start-date" 
            type="date" 
            v-model="startDate"
            class="date-input-field"
          />
        </div>
        <div class="date-input">
          <label for="end-date">終了日:</label>
          <input 
            id="end-date" 
            type="date" 
            v-model="endDate"
            class="date-input-field"
          />
        </div>
      </div>
    </div>

    <!-- 선택된 직원 정보 -->
    <div v-if="selectedEmployee" class="employee-info">
      <h2>従業員情報</h2>
      <div class="employee-details">
        <div class="detail-item">
          <span class="label">従業員番号:</span>
          <span class="value">{{ selectedEmployee.employee_code }}</span>
        </div>
        <div class="detail-item">
          <span class="label">氏名:</span>
          <span class="value">{{ selectedEmployee.last_name }}{{ selectedEmployee.first_name }}</span>
        </div>
        <div class="detail-item">
          <span class="label">部署:</span>
          <span class="value">{{ selectedEmployee.department }}</span>
        </div>
        <div class="detail-item">
          <span class="label">職種:</span>
          <span class="value">{{ selectedEmployee.category_1 }}</span>
        </div>
      </div>
    </div>

    <!-- 근무 통계 -->
    <div v-if="selectedEmployee && selectedPeriodRecords.length > 0" class="work-stats">
      <h2>勤務統計</h2>
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-icon">📅</div>
          <div class="stat-content">
            <div class="stat-number">{{ workStats.totalDays }}</div>
            <div class="stat-label">総勤務日数</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon">⏰</div>
          <div class="stat-content">
            <div class="stat-number">{{ workStats.totalWorkHours }}時間</div>
            <div class="stat-label">総勤務時間</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon">🌅</div>
          <div class="stat-content">
            <div class="stat-number">{{ workStats.holidayWorkHours }}時間</div>
            <div class="stat-label">休日出勤時間</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon">☕</div>
          <div class="stat-content">
            <div class="stat-number">{{ workStats.breakTimeHours }}時間</div>
            <div class="stat-label">休憩時間</div>
          </div>
        </div>
      </div>
    </div>

    <!-- 상세 근무 기록 -->
    <div v-if="selectedEmployee" class="work-records">
      <h2>詳細勤務記録</h2>
      <div v-if="selectedPeriodRecords.length === 0" class="no-records">
        選択された期間の勤務記録がありません。
      </div>
      <div v-else class="records-table">
        <div class="table-header">
          <div class="header-cell">日付</div>
          <div class="header-cell">曜日</div>
          <div class="header-cell">休日区分</div>
          <div class="header-cell">予想出勤</div>
          <div class="header-cell">予想退勤</div>
          <div class="header-cell">休憩時間</div>
          <div class="header-cell">出勤時間</div>
          <div class="header-cell">退勤時間</div>
          <div class="header-cell">勤務時間</div>
          <div class="header-cell">状態</div>
        </div>
        
        <div class="table-body">
          <div 
            v-for="record in selectedPeriodRecords" 
            :key="record.id" 
            class="record-row"
            :class="{ 
              timeDifference: isCheckInTimeDifferent(record) || isCheckOutTimeDifferent(record)
            }"
          >
            <div class="cell date-cell">{{ formatDate(record.date) }}</div>
            <div class="cell day-cell">{{ getDayOfWeek(record.date) }}</div>
            <div class="cell">
              <span v-if="getHolidayType(record.date)" class="holiday-badge">
                {{ getHolidayType(record.date) }}
              </span>
            </div>
            <div class="cell expected-checkin">{{ formatTime(record.scheduled_check_in) }}</div>
            <div class="cell expected-checkout">{{ formatTime(record.scheduled_check_out) }}</div>
            <div class="cell break-time-cell">{{ formatTime(record.break_time) }}</div>
            <div class="cell checkin-cell">
              <div :class="{ 'time-display': !getCheckInDifferenceText(record), 'time-difference': getCheckInDifferenceText(record) }">{{ formatTime(record.check_in) }}</div>
            </div>
            <div class="cell checkout-cell">
              <div :class="{ 'time-display': !getCheckOutDifferenceText(record), 'time-difference': getCheckOutDifferenceText(record) }">{{ formatTime(record.check_out) }}</div>
            </div>
            <div class="cell hours-cell">
              {{ record.total_hours ? `${record.total_hours}時間` : '-' }}
            </div>
            <div class="cell status-cell">
              <span 
                class="status-badge"
                :style="{ backgroundColor: getWorkStatusColor(record) }"
              >
                {{ getWorkStatusText(record) }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.employees-info-page {
  width: 100%;
  margin: 0 auto;
  box-sizing: border-box;
  padding: 2rem;
}

.loading-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  color: white;
}

.loading-spinner {
  width: 50px;
  height: 50px;
  border: 4px solid rgba(255, 255, 255, 0.3);
  border-top: 4px solid white;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 1rem;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.error-message {
  background: #f8d7da;
  color: #721c24;
  padding: 1rem 2rem;
  margin: 1rem 0;
  border-radius: 8px;
  border: 1px solid #f5c6cb;
  text-align: center;
  font-weight: 500;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2rem;
  padding: 2rem;
  background: rgba(255, 255, 255, 0.9);
  border-radius: 16px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
}

.page-header h1 {
  margin: 0;
  color: #2c3e50;
  font-size: 2rem;
  font-weight: 600;
}

.current-time {
  font-size: 1.2rem;
  color: #7f8c8d;
  font-weight: 500;
}

.control-section {
  background: rgba(255, 255, 255, 0.9);
  padding: 2rem;
  border-radius: 16px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
  margin-bottom: 2rem;
  display: flex;
  gap: 2rem;
  flex-wrap: wrap;
  align-items: flex-end;
}

.employee-selector {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  min-width: 300px;
}

.employee-selector label {
  font-weight: 600;
  color: #2c3e50;
}

.employee-select {
  padding: 0.75rem;
  border: 2px solid #e0e0e0;
  border-radius: 8px;
  font-size: 1rem;
  background: white;
  transition: border-color 0.3s ease;
}

.employee-select:focus {
  outline: none;
  border-color: #667eea;
}

.date-range-selector {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
}

.date-input {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.date-input label {
  font-weight: 600;
  color: #2c3e50;
  white-space: nowrap;
}

.date-input-field {
  padding: 0.75rem;
  border: 2px solid #e0e0e0;
  border-radius: 8px;
  font-size: 1rem;
  background: white;
  transition: border-color 0.3s ease;
}

.date-input-field:focus {
  outline: none;
  border-color: #667eea;
}

.employee-info {
  background: rgba(255, 255, 255, 0.9);
  padding: 2rem;
  border-radius: 16px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
  margin-bottom: 2rem;
}

.employee-info h2 {
  margin: 0 0 1rem 0;
  color: #2c3e50;
  font-size: 1.5rem;
}

.employee-details {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem;
}

.detail-item {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.detail-item .label {
  font-size: 0.9rem;
  color: #7f8c8d;
  font-weight: 500;
}

.detail-item .value {
  font-size: 1.1rem;
  color: #2c3e50;
  font-weight: 600;
}

.work-stats {
  background: rgba(255, 255, 255, 0.9);
  padding: 2rem;
  border-radius: 16px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
  margin-bottom: 2rem;
}

.work-stats h2 {
  margin: 0 0 1.5rem 0;
  color: #2c3e50;
  font-size: 1.5rem;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1.5rem;
}

.stat-card {
  display: flex;
  align-items: center;
  gap: 1rem;
  background: rgba(255, 255, 255, 0.8);
  padding: 1.5rem;
  border-radius: 12px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
  transition: transform 0.3s ease;
}

.stat-card:hover {
  transform: translateY(-2px);
}

.stat-icon {
  font-size: 2rem;
  flex-shrink: 0;
}

.stat-content {
  display: flex;
  flex-direction: column;
}

.stat-number {
  font-size: 1.5rem;
  font-weight: 700;
  color: #2c3e50;
  line-height: 1;
}

.stat-label {
  font-size: 0.9rem;
  color: #7f8c8d;
  margin-top: 0.25rem;
}

.work-records {
  background: rgba(255, 255, 255, 0.9);
  padding: 2rem;
  border-radius: 16px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
}

.work-records h2 {
  margin: 0 0 1.5rem 0;
  color: #2c3e50;
  font-size: 1.5rem;
}

.no-records {
  text-align: center;
  color: #7f8c8d;
  font-style: italic;
  padding: 3rem;
  background: rgba(255, 255, 255, 0.5);
  border-radius: 8px;
}

.records-table {
  width: 100%;
  overflow-x: auto;
}

.table-header {
  display: grid;
  grid-template-columns: 1fr 0.5fr 0.8fr 1fr 1fr 1fr 1fr 1fr 1fr 1fr;
  gap: 1rem;
  padding: 1rem;
  background: #f8f9fa;
  border-radius: 8px;
  margin-bottom: 0.5rem;
  font-weight: 600;
  color: #2c3e50;
}

.header-cell {
  padding: 0.5rem;
  text-align: left;
  font-size: 0.9rem;
}

.table-body {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.record-row {
  display: grid;
  grid-template-columns: 1fr 0.5fr 0.8fr 1fr 1fr 1fr 1fr 1fr 1fr 1fr;
  gap: 1rem;
  padding: 1rem;
  background: rgba(255, 255, 255, 0.8);
  border-radius: 8px;
  align-items: center;
  transition: all 0.3s ease;
}

.record-row:hover {
  background: rgba(255, 255, 255, 1);
  transform: translateY(-1px);
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
}

.record-row.holiday {
  background: rgba(255, 248, 220, 0.8);
  border-left: 4px solid #f39c12;
}

.record-row.holiday:hover {
  background: rgba(255, 248, 220, 1);
}

.record-row.publicHoliday {
  background: rgba(255, 235, 235, 0.8);
  border-left: 4px solid #e74c3c;
}

.record-row.publicHoliday:hover {
  background: rgba(255, 235, 235, 1);
}

.record-row.timeDifference {
  background: rgba(231, 76, 60, 0.1);
  border-left: 4px solid #e74c3c;
}

.record-row.timeDifference:hover {
  background: rgba(231, 76, 60, 0.15);
}

.cell {
  padding: 0.5rem;
  font-size: 0.9rem;
}

.date-cell {
  font-weight: 600;
  color: #2c3e50;
}

.day-cell {
  font-weight: 600;
  color: #667eea;
}

.holiday-cell {
  text-align: center;
}

.holiday-badge {
  padding: 0.25rem 1.0rem;
  border-radius: 12px;
  font-size: 0.75rem;
  font-weight: 600;
  color: white;
  background: #e74c3c;
  white-space: nowrap;
}

.expected-checkin,
.expected-checkout {
  color: #7f8c8d;
  font-family: monospace;
}

.checkin-cell,
.checkout-cell {
  color: #2c3e50;
  font-family: monospace;
  font-weight: 500;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.time-display {
  font-size: 0.9rem;
}

.time-difference {
  color: #e74c3c;
  font-weight: 600;
  padding: 0.1rem 0.3rem;
  border-radius: 4px;
  white-space: nowrap;
}

.hours-cell {
  color: #2c3e50;
  font-weight: 600;
}

.status-badge {
  padding: 0.5rem 1rem;
  border-radius: 25px;
  color: white;
  font-size: 0.8rem;
  font-weight: 600;
  text-align: center;
  white-space: nowrap;
  min-width: 60px;
  display: inline-block;
}

@media (max-width: 768px) {
  .employees-info-page {
    padding: 1rem;
  }

  .page-header {
    flex-direction: column;
    gap: 1rem;
    text-align: center;
    padding: 1.5rem;
  }

  .page-header h1 {
    font-size: 1.5rem;
  }

  .control-section {
    flex-direction: column;
    gap: 1rem;
    padding: 1.5rem;
  }

  .employee-selector {
    min-width: auto;
  }

  .date-range-selector {
    flex-direction: column;
  }

  .stats-grid {
    grid-template-columns: 1fr;
  }

  .table-header,
  .record-row {
    grid-template-columns: 1fr;
    gap: 0.5rem;
  }

  .header-cell {
    display: none;
  }

  .cell {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.5rem 0;
    border-bottom: 1px solid #e0e0e0;
  }

  .cell::before {
    content: attr(data-label);
    font-weight: 600;
    color: #2c3e50;
    margin-right: 1rem;
  }
}
</style> 