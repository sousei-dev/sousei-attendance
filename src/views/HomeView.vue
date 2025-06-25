<script setup lang="ts">
import { useSupabaseAttendanceStore } from '../stores/supabaseAttendance'
import { computed, ref, onMounted, onUnmounted } from 'vue'
import type { AttendanceRecord } from '../lib/supabase'
import { useRouter } from 'vue-router'

const router = useRouter()
const store = useSupabaseAttendanceStore()
const searchQuery = ref('')
const currentTime = ref(new Date())
const formattedTime = ref('')
const formattedDate = ref('')

// 실시간 시간 업데이트
let timeInterval: ReturnType<typeof setInterval> | null = null

// 시간과 날짜 포맷팅 함수
const updateFormattedTime = () => {
  formattedTime.value = currentTime.value.toLocaleTimeString('ja-JP', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

const updateFormattedDate = () => {
  formattedDate.value = currentTime.value.toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  })
}

onMounted(async () => {
  // Supabase 데이터 초기화
  await store.initialize()

  // 초기 포맷팅
  updateFormattedTime()
  updateFormattedDate()

  // 실시간 시간 업데이트 시작
  timeInterval = setInterval(() => {
    currentTime.value = new Date()
    updateFormattedTime()
    updateFormattedDate()
  }, 1000)
})

onUnmounted(() => {
  if (timeInterval) {
    clearInterval(timeInterval)
  }
})

// Supabase 시간 형식(HH:MM:SS)을 일본 시간 형식으로 변환
const formatTimeForDisplay = (timeString: string | null | undefined) => {
  if (!timeString) return '-'

  try {
    // HH:MM:SS 형식을 Date 객체로 변환
    const [hours, minutes, seconds] = timeString.split(':').map(Number)
    const date = new Date()
    date.setHours(hours, minutes, seconds)

    // 일본 시간 형식으로 변환
    return date.toLocaleTimeString('ja-JP', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  } catch (error) {
    console.error('時間形式変換エラー:', error)
    return timeString
  }
}

const todayStats = computed(() => {
  const records = store.todayRecords
  const totalEmployees = store.activeEmployees.length
  const checkedIn = records.filter((r) => r.check_in).length
  const checkedOut = records.filter((r) => r.check_out).length

  return {
    total: totalEmployees,
    checkedIn,
    checkedOut,
    present: checkedIn - checkedOut,
  }
})

const filteredEmployees = computed(() => {
  if (!searchQuery.value) {
    return store.activeEmployees
  }

  return store.activeEmployees.filter(
    (employee) =>
      employee.employee_code.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
      `${employee.last_name}${employee.first_name}`.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
      employee.department.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
      employee.category_1.toLowerCase().includes(searchQuery.value.toLowerCase()),
  )
})

// 직원별 기록 캐시 (야간 근무 고려)
const employeeRecordCache = ref<Record<string, { record: AttendanceRecord | undefined; lastUpdate: number }>>({})

// 직원별 기록을 computed로 관리
const employeeRecords = computed(() => {
  // store가 아직 초기화되지 않았거나 로딩 중이면 빈 객체 반환
  if (store.loading || !store.activeEmployees.length) {
    return {}
  }
  
  const records: Record<string, AttendanceRecord | undefined> = {}
  
  filteredEmployees.value.forEach(employee => {
    // 캐시된 기록이 있고 최신이면 반환
    const cached = employeeRecordCache.value[employee.id]
    const now = Date.now()
    if (cached && (now - cached.lastUpdate) < 5000) { // 5초 캐시
      records[employee.id] = cached.record
      return
    }

    // 오늘 기록 확인
    let record = store.getEmployeeRecord(employee.id, store.currentDate)
    
    // 오늘 기록이 없으면 어제 기록 확인 (야간 근무의 경우)
    if (!record) {
      const yesterday = new Date()
      yesterday.setDate(yesterday.getDate() - 1)
      const yesterdayDate = yesterday.toISOString().split('T')[0]
      record = store.getEmployeeRecord(employee.id, yesterdayDate)
    }
    
    // 캐시 업데이트
    employeeRecordCache.value[employee.id] = {
      record,
      lastUpdate: now
    }
    
    records[employee.id] = record
  })
  
  return records
})

// 직원의 출퇴근 기록 가져오기 (야간 근무 고려, 캐시 사용)
const getEmployeeRecordForDisplay = (employeeId: string) => {
  return employeeRecords.value[employeeId]
}

// 직원별 상태를 computed로 관리
const employeeStatuses = computed(() => {
  // store가 아직 초기화되지 않았거나 로딩 중이면 빈 객체 반환
  if (store.loading || !store.activeEmployees.length) {
    return {}
  }
  
  const statuses: Record<string, string> = {}
  
  filteredEmployees.value.forEach(employee => {
    const record = employeeRecords.value[employee.id]
    if (!record) {
      statuses[employee.id] = 'not-checked'
    } else if (record.check_in && record.check_out) {
      statuses[employee.id] = 'checked-out'
    } else if (record.check_in) {
      statuses[employee.id] = 'checked-in'
    } else {
      statuses[employee.id] = 'not-checked'
    }
  })
  
  return statuses
})

const getEmployeeStatus = (employeeId: string) => {
  return employeeStatuses.value[employeeId] || 'not-checked'
}

const getStatusText = (status: string, isNightShift?: boolean) => {
  const baseText = (() => {
    switch (status) {
      case 'not-checked':
        return '未出勤'
      case 'checked-in':
        return '出勤中'
      case 'checked-out':
        return '退勤'
      default:
        return '未出勤'
    }
  })()
  
  // 야간 근무 표시 추가
  if (isNightShift && status === 'checked-in') {
    return `${baseText} (夜勤)`
  }
  
  return baseText
}

const getButtonText = (status: string) => {
  switch (status) {
    case 'not-checked':
      return '出勤'
    case 'checked-in':
      return '退勤'
    case 'checked-out':
      return '完了'
    default:
      return '出勤'
  }
}

const getStatusColor = (status: string) => {
  switch (status) {
    case 'not-checked':
      return '#3498db' // 파란계열
    case 'checked-in':
      return '#27ae60' // 초록계열
    case 'checked-out':
      return '#e74c3c' // 빨간계열
    default:
      return '#3498db'
  }
}

const getButtonColor = (status: string) => {
  switch (status) {
    case 'not-checked':
      return '#27ae60' // 출근버튼 - 초록계열
    case 'checked-in':
      return '#e74c3c' // 퇴근버튼 - 빨간계열
    case 'checked-out':
      return '#3498db' // 완료버튼 - 파랑계열
    default:
      return '#27ae60'
  }
}

const getButtonColorWithExpectedTime = (employeeId: string, status: string) => {
  if (status === 'not-checked' && !isEmployeeExpectedTimeSet(employeeId)) {
    return '#95a5a6' // 예상 시간 미설정 - 회색
  }
  return getButtonColor(status)
}

const handleAttendanceAction = async (employeeId: string) => {
  const status = getEmployeeStatus(employeeId)

  try {
    if (status === 'not-checked') {
      const expectedCheckIn = getEmployeeExpectedTime(employeeId, 'checkIn')
      const expectedCheckOut = getEmployeeExpectedTime(employeeId, 'checkOut')
      const breakTime = getEmployeeExpectedTime(employeeId, 'breakTime')
      await store.checkIn(employeeId, expectedCheckIn, expectedCheckOut, breakTime)
    } else if (status === 'checked-in') {
      await store.checkOut(employeeId)
    }
    
    // 캐시 무효화하여 최신 데이터 반영
    employeeRecordCache.value = {}
    // 예상 시간 캐시도 무효화
    delete employeeExpectedTimes.value[employeeId]
    
    // 데이터 다시 로드
    await store.loadAttendanceRecords()
  } catch (error) {
    console.error('出退勤処理中にエラーが発生しました:', error)
  }
}

const isButtonDisabled = (employeeId: string) => {
  const status = getEmployeeStatus(employeeId)
  
  // 이미 퇴근한 경우
  if (status === 'checked-out') {
    return true
  }
  
  // 출근하지 않은 상태에서 예상 시간이 설정되지 않은 경우
  if (status === 'not-checked' && !isEmployeeExpectedTimeSet(employeeId)) {
    return true
  }
  
  return false
}

// 시간 옵션 생성 (30분 간격)
const generateTimeOptions = () => {
  const options = []
  for (let hour = 0; hour < 24; hour++) {
    for (let minute = 0; minute < 60; minute += 30) {
      const timeString = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`
      options.push(timeString)
    }
  }
  return options
}

const timeOptions = generateTimeOptions()

// 각 직원별 예상 시간 상태
const employeeExpectedTimes = ref<Record<string, { checkIn: string; checkOut: string; breakTime: string }>>({})

// 시간 형식 변환 (HH:MM:SS → HH:MM)
const formatTimeForSelect = (timeString: string | null | undefined) => {
  if (!timeString) return '00:00'
  
  // HH:MM:SS 형식을 HH:MM으로 변환
  const timeParts = timeString.split(':')
  if (timeParts.length >= 2) {
    return `${timeParts[0]}:${timeParts[1]}`
  }
  
  return '00:00'
}

// 시간을 분으로 변환
const timeToMinutes = (timeString: string) => {
  const [hours, minutes] = timeString.split(':').map(Number)
  return hours * 60 + minutes
}

// 직원의 예상 시간 가져오기
const getEmployeeExpectedTime = (employeeId: string, type: 'checkIn' | 'checkOut' | 'breakTime') => {
  if (!employeeExpectedTimes.value[employeeId]) {
    // 먼저 현재 날짜의 AttendanceRecord에서 scheduled 시간 확인
    let record = store.getEmployeeRecord(employeeId, store.currentDate)
    
    // 현재 날짜에 기록이 없으면 어제 기록 확인 (야간 근무의 경우)
    if (!record) {
      const yesterday = new Date()
      yesterday.setDate(yesterday.getDate() - 1)
      const yesterdayDate = yesterday.toISOString().split('T')[0]
      record = store.getEmployeeRecord(employeeId, yesterdayDate)
    }
    
    const scheduledCheckIn = formatTimeForSelect(record?.scheduled_check_in)
    const scheduledCheckOut = formatTimeForSelect(record?.scheduled_check_out)
    const breakTime = formatTimeForSelect(record?.break_time)
    
    employeeExpectedTimes.value[employeeId] = { 
      checkIn: scheduledCheckIn, 
      checkOut: scheduledCheckOut,
      breakTime: breakTime
    }
  }
  return employeeExpectedTimes.value[employeeId][type]
}

// 직원의 예상 시간 설정
const setEmployeeExpectedTime = (employeeId: string, type: 'checkIn' | 'checkOut' | 'breakTime', time: string) => {
  if (!employeeExpectedTimes.value[employeeId]) {
    // 먼저 현재 날짜의 AttendanceRecord에서 scheduled 시간 확인
    let record = store.getEmployeeRecord(employeeId, store.currentDate)
    
    // 현재 날짜에 기록이 없으면 어제 기록 확인 (야간 근무의 경우)
    if (!record) {
      const yesterday = new Date()
      yesterday.setDate(yesterday.getDate() - 1)
      const yesterdayDate = yesterday.toISOString().split('T')[0]
      record = store.getEmployeeRecord(employeeId, yesterdayDate)
    }
    
    const scheduledCheckIn = formatTimeForSelect(record?.scheduled_check_in)
    const scheduledCheckOut = formatTimeForSelect(record?.scheduled_check_out)
    const breakTime = formatTimeForSelect(record?.break_time)
    
    employeeExpectedTimes.value[employeeId] = { 
      checkIn: scheduledCheckIn, 
      checkOut: scheduledCheckOut,
      breakTime: breakTime
    }
  }
  employeeExpectedTimes.value[employeeId][type] = time
}

// 직원의 예상 시간이 모두 설정되었는지 확인
const isEmployeeExpectedTimeSet = (employeeId: string) => {
  const checkIn = getEmployeeExpectedTime(employeeId, 'checkIn')
  return checkIn !== '00:00'
}

// 휴게시간 자동 설정
const autoSetBreakTime = (employeeId: string) => {
  const checkIn = getEmployeeExpectedTime(employeeId, 'checkIn')
  const checkOut = getEmployeeExpectedTime(employeeId, 'checkOut')
  
  if (checkIn !== '00:00' && checkOut !== '00:00') {
    const checkInMinutes = timeToMinutes(checkIn)
    const checkOutMinutes = timeToMinutes(checkOut)
    
    // 퇴근시간이 출근시간보다 작으면 다음날로 간주
    let workMinutes = checkOutMinutes - checkInMinutes
    if (workMinutes <= 0) {
      workMinutes += 24 * 60 // 24시간 추가
    }
    
    const workHours = workMinutes / 60
    
    // 6시간 이상 근무 시 1시간 휴게시간 자동 설정
    if (workHours >= 6) {
      setEmployeeExpectedTime(employeeId, 'breakTime', '01:00')
    } else if (workHours >= 4) {
      setEmployeeExpectedTime(employeeId, 'breakTime', '00:30')
    } else {
      setEmployeeExpectedTime(employeeId, 'breakTime', '00:00')
    }
  }
}

// 휴게시간 옵션 생성 (30분 단위로 4시간까지)
const generateBreakTimeOptions = () => {
  const options = []
  for (let hour = 0; hour <= 4; hour++) {
    for (let minute = 0; minute < 60; minute += 30) {
      const timeString = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`
      options.push(timeString)
    }
  }
  return options
}

const breakTimeOptions = generateBreakTimeOptions()

// 이벤트 핸들러 함수들
const handleExpectedCheckInChange = (employeeId: string, event: Event) => {
  const target = event.target as HTMLSelectElement
  setEmployeeExpectedTime(employeeId, 'checkIn', target.value)
  // 출퇴근시간 변경 시 휴게시간 자동 조정
  autoSetBreakTime(employeeId)
}

const handleExpectedCheckOutChange = (employeeId: string, event: Event) => {
  const target = event.target as HTMLSelectElement
  setEmployeeExpectedTime(employeeId, 'checkOut', target.value)
  // 출퇴근시간 변경 시 휴게시간 자동 조정
  autoSetBreakTime(employeeId)
}

const handleBreakTimeChange = (employeeId: string, event: Event) => {
  const target = event.target as HTMLSelectElement
  setEmployeeExpectedTime(employeeId, 'breakTime', target.value)
}

// 직원 행 클릭 핸들러
const handleEmployeeRowClick = (employeeId: string) => {
  // EmployeesAttendanceView 페이지로 이동하면서 직원 ID를 쿼리 파라미터로 전달
  router.push({
    name: 'employeesAttendanceView',
    query: { employeeId }
  })
}

// 시간을 30분 단위로 반올림하는 함수
const roundToNearestHalfHour = (timeStr: string) => {
  const [hours, minutes] = timeStr.split(':').map(Number)
  
  // 30분 단위로 반올림 (0-29분은 0분, 30분은 30분, 31-59분은 30분)
  let roundedMinutes
  if (minutes < 30) {
    // 0-29분은 0분으로
    roundedMinutes = hours * 60
  } else {
    // 30-59분은 30분으로
    roundedMinutes = hours * 60 + 30
  }
  
  const roundedHours = Math.floor(roundedMinutes / 60)
  const roundedMins = roundedMinutes % 60
  
  return `${roundedHours.toString().padStart(2, '0')}:${roundedMins.toString().padStart(2, '0')}`
}

// 시간을 분으로 변환 (반올림 적용)
const getMinutesFromTime = (timeStr: string) => {
  const roundedTime = roundToNearestHalfHour(timeStr)
  const [hours, minutes] = roundedTime.split(':').map(Number)
  return hours * 60 + minutes
}

// 근무시간 계산 함수 (출퇴근 시간 기반, 휴식시간 제외)
const calculateWorkHours = (checkInTime: string | null, checkOutTime: string | null, breakTime: string | null) => {
  if (!checkInTime || !checkOutTime) return 0
  
  // 30분 단위로 반올림된 시간으로 계산
  const checkInMinutes = getMinutesFromTime(checkInTime)
  const checkOutMinutes = getMinutesFromTime(checkOutTime)
  
  // 퇴근시간이 출근시간보다 작으면 다음날로 간주 (야간근무)
  let workMinutes = checkOutMinutes - checkInMinutes
  if (workMinutes <= 0) {
    workMinutes += 24 * 60 // 24시간 추가
  }
  
  // 휴식시간 계산 (분 단위)
  const getBreakTimeMinutes = (breakTimeStr: string | null) => {
    if (!breakTimeStr) return 0
    const [hours, minutes] = breakTimeStr.split(':').map(Number)
    return hours * 60 + minutes
  }
  
  const breakTimeMinutes = getBreakTimeMinutes(breakTime)
  const breakTimeHours = breakTimeMinutes / 60
  
  // 총 근무시간에서 휴식시간 제외
  const netWorkHours = (workMinutes / 60) - breakTimeHours
  
  return Math.max(0, netWorkHours) // 음수가 되지 않도록
}
</script>

<template>
  <div class="dashboard">
    <!-- 로딩 상태 표시 -->
    <div v-if="store.loading" class="loading-overlay">
      <div class="loading-spinner"></div>
      <p>データを読み込み中...</p>
    </div>

    <!-- 에러 메시지 표시 -->
    <div v-if="store.error" class="error-message">
      {{ store.error }}
    </div>

    <div class="dashboard-header">
      <div class="header-content">
        <div class="header-left">
          <h1>出退勤システムダッシュボード</h1>
          <div class="current-time">
            <div class="time">{{ formattedTime }}</div>
            <div class="date">{{ formattedDate }}</div>
          </div>
        </div>
        <div class="stats-overview">
          <div class="stat-item">
            <div class="stat-icon">👥</div>
            <div class="stat-info">
              <div class="stat-number">{{ todayStats.total }}</div>
              <div class="stat-label">全従業員</div>
            </div>
          </div>
          <div class="stat-item">
            <div class="stat-icon">✅</div>
            <div class="stat-info">
              <div class="stat-number">{{ todayStats.checkedIn }}</div>
              <div class="stat-label">出勤完了</div>
            </div>
          </div>
          <div class="stat-item">
            <div class="stat-icon">🏢</div>
            <div class="stat-info">
              <div class="stat-number">{{ todayStats.present }}</div>
              <div class="stat-label">現在勤務中</div>
            </div>
          </div>
          <div class="stat-item">
            <div class="stat-icon">🏠</div>
            <div class="stat-info">
              <div class="stat-number">{{ todayStats.checkedOut }}</div>
              <div class="stat-label">退勤完了</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 직원 리스트 섹션 -->
    <div class="employees-section">
      <div class="section-header">
        <h2>従業員出退勤管理</h2>
        <div class="header-controls">
          <div class="search-box">
            <input
              v-model="searchQuery"
              type="text"
              placeholder="従業員名、部署、職種で検索..."
              class="search-input"
            />
            <span class="search-icon">🔍</span>
          </div>
        </div>
      </div>

      <div class="employees-table">
        <div class="table-header">
          <div class="header-cell">従業員番号</div>
          <div class="header-cell">従業員名</div>
          <div class="header-cell">部署</div>
          <div class="header-cell">職種</div>
          <div class="header-cell">予想 出勤時間</div>
          <div class="header-cell">予想 退勤時間</div>
          <div class="header-cell">休憩時間</div>
          <div class="header-cell">出勤時間</div>
          <div class="header-cell">退勤時間</div>
          <div class="header-cell">勤務時間</div>
          <div class="header-cell">状態</div>
          <div class="header-cell">操作</div>
        </div>

        <div v-if="filteredEmployees.length === 0" class="no-employees">
          {{ searchQuery ? '検索結果がありません。' : '登録された従業員がいません。' }}
        </div>

        <div v-else class="employee-rows">
          <div v-for="employee in filteredEmployees" :key="employee.id" class="employee-row" @click="handleEmployeeRowClick(employee.id)">
            <div class="cell employee-code">{{ employee.employee_code }}</div>
            <div class="cell employee-name">{{ employee.last_name }}{{ employee.first_name }}</div>
            <div class="cell employee-dept">{{ employee.department }}</div>
            <div class="cell employee-position">{{ employee.category_1 }}</div>
            <div class="cell expected-checkin">
              <select 
                :value="getEmployeeExpectedTime(employee.id, 'checkIn')"
                @change="handleExpectedCheckInChange(employee.id, $event)"
                @click.stop
                class="time-select-small"
                :disabled="getEmployeeStatus(employee.id) === 'checked-out'"
              >
                <option v-for="time in timeOptions" :key="time" :value="time">
                  {{ time }}
                </option>
              </select>
            </div>
            <div class="cell expected-checkout">
              <select 
                :value="getEmployeeExpectedTime(employee.id, 'checkOut')"
                @change="handleExpectedCheckOutChange(employee.id, $event)"
                @click.stop
                class="time-select-small"
                :disabled="getEmployeeStatus(employee.id) === 'checked-out'"
              >
                <option v-for="time in timeOptions" :key="time" :value="time">
                  {{ time }}
                </option>
              </select>
            </div>
            <div class="cell break-time">
              <select 
                :value="getEmployeeExpectedTime(employee.id, 'breakTime')"
                @change="handleBreakTimeChange(employee.id, $event)"
                @click.stop
                class="time-select-small"
                :disabled="getEmployeeStatus(employee.id) === 'checked-out'"
              >
                <option v-for="time in breakTimeOptions" :key="time" :value="time">
                  {{ time }}
                </option>
              </select>
            </div>
            <div class="cell check-in-time">
              {{ getEmployeeRecordForDisplay(employee.id)?.is_night_shift ? '前日' : '' }}
              {{
                formatTimeForDisplay(
                  getEmployeeRecordForDisplay(employee.id)?.check_in,
                )
              }}
            </div>
            <div class="cell check-out-time">
              {{
                formatTimeForDisplay(
                  getEmployeeRecordForDisplay(employee.id)?.check_out,
                )
              }}
            </div>
            <div class="cell total-hours">
              {{
                getEmployeeRecordForDisplay(employee.id)?.check_in && getEmployeeRecordForDisplay(employee.id)?.check_out
                  ? `${calculateWorkHours(getEmployeeRecordForDisplay(employee.id)?.check_in, getEmployeeRecordForDisplay(employee.id)?.check_out, getEmployeeRecordForDisplay(employee.id)?.break_time).toFixed(1)}時間`
                  : '-'
              }}
            </div>
            <div class="cell status">
              <span
                class="status-badge"
                :style="{ backgroundColor: getStatusColor(getEmployeeStatus(employee.id)) }"
              >
                {{ getStatusText(getEmployeeStatus(employee.id), getEmployeeRecordForDisplay(employee.id)?.is_night_shift) }}
              </span>
            </div>
            <div class="cell action">
              <button
                @click.stop="handleAttendanceAction(employee.id)"
                :disabled="isButtonDisabled(employee.id) || store.loading"
                class="attendance-btn"
                :style="{ backgroundColor: getButtonColorWithExpectedTime(employee.id, getEmployeeStatus(employee.id)) }"
                :class="{
                  'check-in': getEmployeeStatus(employee.id) === 'not-checked',
                  'check-out': getEmployeeStatus(employee.id) === 'checked-in',
                  disabled: isButtonDisabled(employee.id),
                }"
                :title="getEmployeeStatus(employee.id) === 'not-checked' && !isEmployeeExpectedTimeSet(employee.id) ? '예상 출퇴근시간을 먼저 설정해주세요' : ''"
              >
                {{ getButtonText(getEmployeeStatus(employee.id)) }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dashboard {
  width: 100%;
  margin: 0 auto;
  box-sizing: border-box;
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

.loading-overlay .loading-spinner {
  width: 50px;
  height: 50px;
  border: 4px solid rgba(255, 255, 255, 0.3);
  border-top: 4px solid white;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 1rem;
}

@keyframes spin {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}

.error-message {
  background: #f8d7da;
  color: #721c24;
  padding: 1rem 2rem;
  margin: 1rem 2rem;
  border-radius: 8px;
  border: 1px solid #f5c6cb;
  text-align: center;
  font-weight: 500;
}

.dashboard-header,
.employees-section,
.recent-activity {
  border-radius: 16px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
  margin: 0 0 2rem 0;
  width: 100%;
  padding-left: 2rem;
  padding-right: 2rem;
}

.dashboard-header {
  min-width: 0;
  background: rgba(255, 255, 255, 0.9);
  padding: 2rem;
  margin-bottom: 2rem;
  border-radius: 16px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
}

.header-content {
  display: flex;
  align-items: center;
  gap: 5rem;
  flex-wrap: wrap;
}

.header-left {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.dashboard-header h1 {
  margin: 0;
  color: #2c3e50;
  font-size: 1.8rem;
  font-weight: 600;
  white-space: nowrap;
}

.current-time {
  text-align: left;
}

.time {
  font-size: 2rem;
  font-weight: 700;
  color: #667eea;
  margin-bottom: 0.5rem;
  white-space: nowrap;
}

.date {
  font-size: 1rem;
  color: #7f8c8d;
  white-space: nowrap;
}

.stats-overview {
  display: flex;
  gap: 1.5rem;
  flex-wrap: wrap;
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 1.75rem;
  background: rgba(255, 255, 255, 0.8);
  padding: 1.5rem;
  border-radius: 12px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
  transition: transform 0.3s ease;
  min-width: 250px;
}

.stat-item:hover {
  transform: translateY(-2px);
}

.stat-icon {
  font-size: 2.5rem;
  flex-shrink: 0;
}

.stat-info {
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
  font-size: 1.5rem;
  color: #7f8c8d;
  white-space: nowrap;
}

/* 직원 리스트 섹션 */
.employees-section {
  min-width: 0;
  background: rgba(255, 255, 255, 0.9);
  padding: 2rem;
  margin-bottom: 2rem;
  border-radius: 16px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
  flex-wrap: wrap;
  gap: 1rem;
}

.section-header h2 {
  margin: 0;
  color: #2c3e50;
  font-size: 1.5rem;
  font-weight: 600;
}

.header-controls {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
  align-items: flex-end;
}

.time-settings {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
}

.time-setting-item {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.time-setting-item label {
  font-size: 0.9rem;
  font-weight: 600;
  color: #2c3e50;
  white-space: nowrap;
}

.time-select {
  width: 120px;
  padding: 0.75rem;
  border: 2px solid #e0e0e0;
  border-radius: 8px;
  font-size: 1rem;
  background: white;
  transition: border-color 0.3s ease;
  cursor: pointer;
}

.time-select:focus {
  outline: none;
  border-color: #667eea;
}

.time-select:hover {
  border-color: #667eea;
}

.time-select-small {
  width: 100%;
  padding: 0.5rem;
  border: 1px solid #e0e0e0;
  border-radius: 6px;
  font-size: 0.85rem;
  background: white;
  transition: border-color 0.3s ease;
  cursor: pointer;
}

.time-select-small:focus {
  outline: none;
  border-color: #667eea;
}

.time-select-small:hover {
  border-color: #667eea;
}

.time-select-small:disabled {
  background-color: #f5f5f5;
  color: #999;
  cursor: not-allowed;
  border-color: #ddd;
}

.time-select-small:disabled:hover {
  border-color: #ddd;
}

.search-box {
  position: relative;
  min-width: 300px;
}

.search-input {
  width: 100%;
  padding: 0.75rem 1rem 0.75rem 2.5rem;
  border: 2px solid #e0e0e0;
  border-radius: 8px;
  font-size: 1rem;
  background: white;
  transition: border-color 0.3s ease;
}

.search-input:focus {
  outline: none;
  border-color: #667eea;
}

.search-icon {
  position: absolute;
  left: 0.75rem;
  top: 50%;
  transform: translateY(-50%);
  color: #7f8c8d;
  font-size: 1rem;
}

.employees-table {
  width: 100%;
  overflow-x: auto;
}

.table-header {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr 1fr 1fr 1fr 1fr 1fr 1fr 1fr 1fr 1fr;
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

.employee-rows {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.employee-row {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr 1fr 1fr 1fr 1fr 1fr 1fr 1fr 1fr 1fr;
  gap: 1rem;
  padding: 1rem;
  background: rgba(255, 255, 255, 0.8);
  border-radius: 8px;
  align-items: center;
  transition: all 0.3s ease;
  cursor: pointer;
}

.employee-row:hover {
  background: rgba(255, 255, 255, 1);
  transform: translateY(-2px);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
  border: 2px solid #667eea;
}

.cell {
  padding: 0.5rem;
  font-size: 0.9rem;
}

.employee-code {
  font-weight: 600;
  color: #2c3e50;
}

.employee-name {
  font-weight: 600;
  color: #2c3e50;
}

.employee-dept {
  color: #667eea;
  font-weight: 500;
}

.employee-position {
  color: #7f8c8d;
}

.check-in-time,
.check-out-time,
.total-hours {
  color: #2c3e50;
  font-family: monospace;
}

.status-badge {
  padding: 0.5rem 1rem;
  border-radius: 25px;
  color: white;
  font-size: 0.9rem;
  font-weight: 600;
  text-align: center;
  white-space: nowrap;
  min-width: 80px;
  min-height: 35px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.attendance-btn {
  padding: 0.75rem 1.5rem;
  border: none;
  border-radius: 8px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
  white-space: nowrap;
  min-width: 100px;
  min-height: 45px;
}

.attendance-btn.check-in {
  background: #667eea;
  color: white;
}

.attendance-btn.check-in:hover:not(:disabled) {
  background: #5a6fd8;
  transform: translateY(-1px);
}

.attendance-btn.check-out {
  background: #e74c3c;
  color: white;
}

.attendance-btn.check-out:hover:not(:disabled) {
  background: #c0392b;
  transform: translateY(-1px);
}

.attendance-btn.disabled {
  background: #7f8c8d;
  color: white;
  cursor: not-allowed;
}

.attendance-btn.disabled:hover {
  transform: none;
}

.no-employees {
  text-align: center;
  color: #7f8c8d;
  font-style: italic;
  padding: 2rem;
  background: rgba(255, 255, 255, 0.8);
  border-radius: 8px;
}

.recent-activity {
  min-width: 0;
  background: rgba(255, 255, 255, 0.9);
  padding: 2rem;
  border-radius: 16px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
}

.recent-activity h2 {
  margin: 0 0 1rem 0;
  color: #2c3e50;
  font-size: 1.3rem;
}

.activity-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.no-records {
  text-align: center;
  color: #7f8c8d;
  font-style: italic;
  padding: 1.5rem;
}

.activity-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem;
  background: rgba(255, 255, 255, 0.5);
  border-radius: 12px;
  border-left: 4px solid #667eea;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.employee-info {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  min-width: 120px;
}

.employee-name {
  font-weight: 600;
  color: #2c3e50;
  white-space: nowrap;
}

.employee-dept {
  font-size: 0.85rem;
  color: #7f8c8d;
  white-space: nowrap;
}

.attendance-info {
  display: flex;
  gap: 0.75rem;
  align-items: center;
  font-size: 0.85rem;
  flex-wrap: wrap;
}

.check-in {
  color: #27ae60;
  font-weight: 500;
  white-space: nowrap;
}

.check-out {
  color: #e74c3c;
  font-weight: 500;
  white-space: nowrap;
}

.total-hours {
  color: #7f8c8d;
  font-style: italic;
  white-space: nowrap;
}

@media (max-width: 768px) {
  .dashboard {
    padding: 0;
  }

  .dashboard-header,
  .employees-section,
  .recent-activity {
    margin: 0 0 1.5rem 0;
    padding: 1.5rem;
  }

  .header-content {
    flex-direction: column;
    gap: 1.5rem;
    text-align: center;
  }

  .header-left {
    align-items: center;
  }

  .dashboard-header h1 {
    font-size: 1.5rem;
  }

  .time {
    font-size: 1.5rem;
  }

  .date {
    font-size: 0.9rem;
  }

  .stats-overview {
    justify-content: center;
    gap: 1rem;
  }

  .stat-item {
    min-width: 100px;
    padding: 0.75rem;
  }

  .stat-icon {
    font-size: 1.2rem;
  }

  .stat-number {
    font-size: 1.2rem;
  }

  .section-header {
    flex-direction: column;
    align-items: stretch;
  }

  .header-controls {
    flex-direction: column;
    gap: 1rem;
  }

  .time-settings {
    justify-content: center;
  }

  .time-setting-item {
    min-width: 120px;
  }

  .search-box {
    min-width: auto;
  }

  .table-header,
  .employee-row {
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

  .activity-item {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.5rem;
  }

  .attendance-info {
    width: 100%;
    justify-content: flex-start;
  }
}

@media (max-width: 480px) {
  .dashboard-header,
  .employees-section,
  .recent-activity {
    margin: 0 0 1rem 0;
    padding: 1rem;
  }

  .dashboard-header h1 {
    font-size: 1.3rem;
  }

  .time {
    font-size: 1.3rem;
  }

  .stats-overview {
    flex-direction: column;
    align-items: center;
  }

  .stat-item {
    width: 100%;
    max-width: 200px;
  }

  .table-header,
  .employee-row {
    grid-template-columns: 1fr;
  }

  .recent-activity h2 {
    font-size: 1.2rem;
  }
}
</style>

