<script setup lang="ts">
import { useSupabaseAttendanceStore } from '../stores/supabaseAttendance'
import { ref, computed } from 'vue'

const store = useSupabaseAttendanceStore()
const selectedEmployeeId = ref('')
const message = ref('')
const messageType = ref<'success' | 'error'>('success')

const currentTime = computed(() => {
  return new Date().toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
})

const showMessage = (msg: string, type: 'success' | 'error') => {
  message.value = msg
  messageType.value = type
  setTimeout(() => {
    message.value = ''
  }, 3000)
}

const handleCheckIn = () => {
  if (!selectedEmployeeId.value) {
    showMessage('직원을 선택해주세요.', 'error')
    return
  }

  try {
    store.checkIn(selectedEmployeeId.value)
    const employee = store.getEmployeeById(selectedEmployeeId.value)
    showMessage(`${employee?.last_name}${employee?.first_name}님 출근 처리되었습니다.`, 'success')
  } catch (error) {
    showMessage(
      error instanceof Error ? error.message : '출근 처리 중 오류가 발생했습니다.',
      'error',
    )
  }
}

const handleCheckOut = () => {
  if (!selectedEmployeeId.value) {
    showMessage('직원을 선택해주세요.', 'error')
    return
  }

  try {
    store.checkOut(selectedEmployeeId.value)
    const employee = store.getEmployeeById(selectedEmployeeId.value)
    showMessage(`${employee?.last_name}${employee?.first_name}님 퇴근 처리되었습니다.`, 'success')
  } catch (error) {
    showMessage(
      error instanceof Error ? error.message : '퇴근 처리 중 오류가 발생했습니다.',
      'error',
    )
  }
}

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
      return '미출근'
    case 'checked-in':
      return '출근완료'
    case 'checked-out':
      return '퇴근완료'
    default:
      return '미출근'
  }
}

const getStatusColor = (status: string) => {
  switch (status) {
    case 'not-checked':
      return '#e74c3c'
    case 'checked-in':
      return '#27ae60'
    case 'checked-out':
      return '#7f8c8d'
    default:
      return '#e74c3c'
  }
}
</script>

<template>
  <div class="attendance-page">
    <div class="page-header">
      <h1>출/퇴근 기록</h1>
      <div class="current-time">{{ currentTime }}</div>
    </div>

    <div v-if="message" class="message" :class="messageType">
      {{ message }}
    </div>

    <div class="attendance-controls">
      <div class="control-card">
        <h2>출/퇴근 처리</h2>
        <div class="control-form">
          <div class="form-group">
            <label for="employee-select">직원 선택</label>
            <select id="employee-select" v-model="selectedEmployeeId" class="form-select">
              <option value="">직원을 선택하세요</option>
              <option
                v-for="employee in store.activeEmployees"
                :key="employee.id"
                :value="employee.id"
              >
                {{ employee.last_name }}{{ employee.first_name }} ({{ employee.facility_id ? store.getFacilityName(employee.facility_id) : '-' }})
              </option>
            </select>
          </div>

          <div class="button-group">
            <button @click="handleCheckIn" class="btn btn-primary" :disabled="!selectedEmployeeId">
              출근 처리
            </button>
            <button
              @click="handleCheckOut"
              class="btn btn-secondary"
              :disabled="!selectedEmployeeId"
            >
              퇴근 처리
            </button>
          </div>
        </div>
      </div>
    </div>

    <div class="attendance-list">
      <h2>오늘의 출/퇴근 현황</h2>
      <div class="employee-grid">
        <div
          v-for="employee in store.activeEmployees"
          :key="employee.id"
          class="employee-card"
          :class="{ selected: selectedEmployeeId === employee.id }"
          @click="selectedEmployeeId = employee.id"
        >
          <div class="employee-header">
            <div class="employee-avatar">
              {{ employee.last_name.charAt(0) }}
            </div>
            <div class="employee-info">
              <div class="employee-name">{{ employee.last_name }}{{ employee.first_name }}</div>
              <div class="employee-dept">{{ employee.facility_id ? store.getFacilityName(employee.facility_id) : '-' }}</div>
              <div class="employee-position">{{ employee.category_1 }}</div>
            </div>
            <div
              class="status-badge"
              :style="{ backgroundColor: getStatusColor(getEmployeeStatus(employee.id)) }"
            >
              {{ getStatusText(getEmployeeStatus(employee.id)) }}
            </div>
          </div>

          <div class="attendance-details">
            <div v-if="store.getEmployeeRecord(employee.id, store.currentDate)" class="time-info">
              <div
                v-if="store.getEmployeeRecord(employee.id, store.currentDate)?.check_in"
                class="time-item"
              >
                <span class="time-label">출근:</span>
                <span class="time-value">{{
                  store.getEmployeeRecord(employee.id, store.currentDate)?.check_in
                }}</span>
              </div>
              <div
                v-if="store.getEmployeeRecord(employee.id, store.currentDate)?.check_out"
                class="time-item"
              >
                <span class="time-label">퇴근:</span>
                <span class="time-value">{{
                  store.getEmployeeRecord(employee.id, store.currentDate)?.check_out
                }}</span>
              </div>

            </div>
            <div v-else class="no-record">아직 출/퇴근 기록이 없습니다.</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.attendance-page {
  width: 100%;
  margin: 0 auto;
  box-sizing: border-box;
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
  flex-wrap: wrap;
  gap: 1rem;
}

.page-header h1 {
  margin: 0;
  color: #2c3e50;
  font-size: 1.8rem;
  font-weight: 600;
  white-space: nowrap;
}

.current-time {
  font-size: 1.3rem;
  font-weight: 600;
  color: #667eea;
  white-space: nowrap;
}

.message {
  padding: 1rem 1.5rem;
  border-radius: 12px;
  margin-bottom: 1.5rem;
  font-weight: 500;
}

.message.success {
  background: #d4edda;
  color: #155724;
  border: 1px solid #c3e6cb;
}

.message.error {
  background: #f8d7da;
  color: #721c24;
  border: 1px solid #f5c6cb;
}

.attendance-controls {
  margin-bottom: 2rem;
}

.control-card {
  background: rgba(255, 255, 255, 0.9);
  padding: 2rem;
  border-radius: 16px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
}

.control-card h2 {
  margin: 0 0 1rem 0;
  color: #2c3e50;
  font-size: 1.3rem;
}

.control-form {
  display: flex;
  gap: 1.5rem;
  align-items: end;
  flex-wrap: wrap;
}

.form-group {
  flex: 1;
  min-width: 200px;
}

.form-group label {
  display: block;
  margin-bottom: 0.5rem;
  color: #2c3e50;
  font-weight: 500;
}

.form-select {
  width: 100%;
  padding: 0.75rem 1rem;
  border: 2px solid #e0e0e0;
  border-radius: 8px;
  font-size: 1rem;
  background: white;
  transition: border-color 0.3s ease;
  box-sizing: border-box;
}

.form-select:focus {
  outline: none;
  border-color: #667eea;
}

.button-group {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.btn {
  padding: 0.75rem 1.5rem;
  border: none;
  border-radius: 8px;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
  white-space: nowrap;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-primary {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

.btn-primary:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 8px 25px rgba(102, 126, 234, 0.3);
}

.btn-secondary {
  background: #6c757d;
  color: white;
}

.btn-secondary:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 8px 25px rgba(108, 117, 125, 0.3);
}

.attendance-list {
  width: 100%;
  min-width: 0;
  background: rgba(255, 255, 255, 0.9);
  padding: 2rem;
  border-radius: 16px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
}

.attendance-list h2 {
  margin: 0 0 1rem 0;
  color: #2c3e50;
  font-size: 1.3rem;
}

.employee-grid {
  width: 100%;
  min-width: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 1rem;
}

.employee-card {
  width: 100%;
  min-width: 0;
  background: rgba(255, 255, 255, 0.8);
  border-radius: 12px;
  padding: 1.5rem;
  border: 2px solid transparent;
  cursor: pointer;
  transition: all 0.3s ease;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
}

.employee-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 25px rgba(0, 0, 0, 0.1);
}

.employee-card.selected {
  border-color: #667eea;
  background: rgba(102, 126, 234, 0.05);
}

.employee-header {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 1rem;
  flex-wrap: wrap;
}

.employee-avatar {
  width: 50px;
  height: 50px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.5rem;
  font-weight: 600;
  flex-shrink: 0;
}

.employee-info {
  flex: 1;
  min-width: 120px;
}

.employee-name {
  font-size: 1.1rem;
  font-weight: 600;
  color: #2c3e50;
  margin-bottom: 0.25rem;
  white-space: nowrap;
}

.employee-dept {
  font-size: 0.85rem;
  color: #667eea;
  font-weight: 500;
  margin-bottom: 0.25rem;
  white-space: nowrap;
}

.employee-position {
  font-size: 0.8rem;
  color: #7f8c8d;
  white-space: nowrap;
}

.status-badge {
  padding: 0.5rem 1rem;
  border-radius: 20px;
  color: white;
  font-size: 0.8rem;
  font-weight: 600;
  text-align: center;
  white-space: nowrap;
  flex-shrink: 0;
}

.attendance-details {
  border-top: 1px solid #e0e0e0;
  padding-top: 1rem;
}

.time-info {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.time-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.time-label {
  font-size: 0.85rem;
  color: #7f8c8d;
  white-space: nowrap;
}

.time-value {
  font-size: 0.85rem;
  font-weight: 600;
  color: #2c3e50;
  white-space: nowrap;
}

.no-record {
  text-align: center;
  color: #7f8c8d;
  font-style: italic;
  padding: 1rem;
}

@media (max-width: 768px) {
  .attendance-page {
    padding: 0;
  }

  .page-header,
  .control-card,
  .attendance-list {
    margin: 0 0 1.5rem 0;
    padding: 1.5rem;
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

  .current-time {
    font-size: 1.1rem;
  }

  .control-form {
    flex-direction: column;
    gap: 1rem;
  }

  .form-group {
    min-width: auto;
  }

  .button-group {
    flex-direction: column;
    gap: 0.5rem;
  }

  .btn {
    width: 100%;
    justify-content: center;
  }

  .employee-grid {
    grid-template-columns: 1fr;
    gap: 0.75rem;
  }

  .employee-header {
    flex-direction: column;
    text-align: center;
    gap: 0.75rem;
  }

  .employee-info {
    text-align: center;
  }

  .time-item {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.25rem;
  }
}

@media (max-width: 480px) {
  .page-header,
  .control-card,
  .attendance-list {
    margin: 0 0 1rem 0;
    padding: 1rem;
  }

  .page-header {
    padding: 1rem;
  }

  .page-header h1 {
    font-size: 1.3rem;
  }

  .current-time {
    font-size: 1rem;
  }

  .control-card h2,
  .attendance-list h2 {
    font-size: 1.2rem;
  }

  .employee-card {
    padding: 1rem;
  }
}
</style>
