<script setup lang="ts">
import { useSupabaseAttendanceStore } from '../stores/supabaseAttendance'
import { computed, ref, onMounted, onUnmounted } from 'vue'

const store = useSupabaseAttendanceStore()
const searchQuery = ref('')
const currentTime = ref(new Date())

// 실시간 시간 업데이트
let timeInterval: ReturnType<typeof setInterval> | null = null

onMounted(async () => {
  // Supabase 데이터 초기화
  await store.initialize()

  // 실시간 시간 업데이트 시작
  timeInterval = setInterval(() => {
    currentTime.value = new Date()
  }, 1000)
})

onUnmounted(() => {
  if (timeInterval) {
    clearInterval(timeInterval)
  }
})

const formattedTime = computed(() => {
  return currentTime.value.toLocaleTimeString('ja-JP', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
})

const formattedDate = computed(() => {
  return currentTime.value.toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  })
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
      `${employee.last_name}${employee.first_name}`.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
      employee.department.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
      employee.category_1.toLowerCase().includes(searchQuery.value.toLowerCase()),
  )
})

const getEmployeeStatus = (employeeId: string) => {
  const record = store.getEmployeeRecord(employeeId, store.currentDate)
  if (!record) return 'not-checked'
  if (record.check_in && record.check_out) return 'checked-out'
  if (record.check_in) return 'checked-in'
  return 'not-checked'
}

const getStatusText = (status: string) => {
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

const handleAttendanceAction = async (employeeId: string) => {
  const status = getEmployeeStatus(employeeId)

  try {
    if (status === 'not-checked') {
      await store.checkIn(employeeId)
    } else if (status === 'checked-in') {
      await store.checkOut(employeeId)
    }
  } catch (error) {
    console.error('出退勤処理中にエラーが発生しました:', error)
  }
}

const isButtonDisabled = (employeeId: string) => {
  const status = getEmployeeStatus(employeeId)
  return status === 'checked-out'
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

      <div class="employees-table">
        <div class="table-header">
          <div class="header-cell">従業員番号</div>
          <div class="header-cell">従業員名</div>
          <div class="header-cell">部署</div>
          <div class="header-cell">職種</div>
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
          <div v-for="employee in filteredEmployees" :key="employee.id" class="employee-row">
            <div class="cell employee-code">{{ employee.employee_code }}</div>
            <div class="cell employee-name">{{ employee.last_name }}{{ employee.first_name }}</div>
            <div class="cell employee-dept">{{ employee.department }}</div>
            <div class="cell employee-position">{{ employee.category_1 }}</div>
            <div class="cell check-in-time">
              {{
                formatTimeForDisplay(
                  store.getEmployeeRecord(employee.id, store.currentDate)?.check_in,
                )
              }}
            </div>
            <div class="cell check-out-time">
              {{
                formatTimeForDisplay(
                  store.getEmployeeRecord(employee.id, store.currentDate)?.check_out,
                )
              }}
            </div>
            <div class="cell total-hours">
              {{
                store.getEmployeeRecord(employee.id, store.currentDate)?.total_hours
                  ? `${store.getEmployeeRecord(employee.id, store.currentDate)?.total_hours}時間`
                  : '-'
              }}
            </div>
            <div class="cell status">
              <span
                class="status-badge"
                :style="{ backgroundColor: getStatusColor(getEmployeeStatus(employee.id)) }"
              >
                {{ getStatusText(getEmployeeStatus(employee.id)) }}
              </span>
            </div>
            <div class="cell action">
              <button
                @click="handleAttendanceAction(employee.id)"
                :disabled="isButtonDisabled(employee.id) || store.loading"
                class="attendance-btn"
                :style="{ backgroundColor: getButtonColor(getEmployeeStatus(employee.id)) }"
                :class="{
                  'check-in': getEmployeeStatus(employee.id) === 'not-checked',
                  'check-out': getEmployeeStatus(employee.id) === 'checked-in',
                  disabled: getEmployeeStatus(employee.id) === 'checked-out',
                }"
              >
                {{ getButtonText(getEmployeeStatus(employee.id)) }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="recent-activity">
      <h2>今日の出退勤状況</h2>
      <div class="activity-list">
        <div v-if="store.todayRecords.length === 0" class="no-records">
          まだ出退勤記録がありません。
        </div>
        <div v-else class="activity-item" v-for="record in store.todayRecords" :key="record.id">
          <div class="employee-info">
            <span class="employee-name">{{ 
              (() => {
                const employee = store.getEmployeeById(record.employee_id)
                return employee ? `${employee.last_name}${employee.first_name}` : ''
              })()
            }}</span>
            <span class="employee-dept">{{
              store.getEmployeeById(record.employee_id)?.department
            }}</span>
          </div>
          <div class="attendance-info">
            <span v-if="record.check_in" class="check-in"
              >出勤: {{ formatTimeForDisplay(record.check_in) }}</span
            >
            <span v-if="record.check_out" class="check-out"
              >退勤: {{ formatTimeForDisplay(record.check_out) }}</span
            >
            <span v-if="record.total_hours" class="total-hours"
              >({{ record.total_hours }}時間)</span
            >
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
  grid-template-columns: 1fr 1fr 1fr 1fr 1fr 1fr 1fr 1fr 1fr;
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
  grid-template-columns: 1fr 1fr 1fr 1fr 1fr 1fr 1fr 1fr 1fr;
  gap: 1rem;
  padding: 1rem;
  background: rgba(255, 255, 255, 0.8);
  border-radius: 8px;
  align-items: center;
  transition: all 0.3s ease;
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
