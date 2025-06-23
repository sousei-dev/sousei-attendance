<script setup lang="ts">
import { useAttendanceStore } from '../stores/attendance'
import { ref, computed } from 'vue'

const store = useAttendanceStore()

const selectedYear = ref(new Date().getFullYear())
const selectedMonth = ref(new Date().getMonth() + 1)

const monthlyRecords = computed(() => {
  return store.getMonthlyReport(selectedYear.value, selectedMonth.value)
})

const monthlyStats = computed(() => {
  const records = monthlyRecords.value
  const totalDays = new Date(selectedYear.value, selectedMonth.value, 0).getDate()
  const totalEmployees = store.activeEmployees.length
  const totalWorkDays = totalDays * totalEmployees

  const presentDays = records.filter((r) => r.checkIn).length
  const absentDays = totalWorkDays - presentDays
  const totalHours = records.reduce((sum, r) => sum + (r.totalHours || 0), 0)
  const avgHours = presentDays > 0 ? totalHours / presentDays : 0

  return {
    totalDays,
    totalEmployees,
    totalWorkDays,
    presentDays,
    absentDays,
    totalHours,
    avgHours: Math.round(avgHours * 100) / 100,
    attendanceRate: Math.round((presentDays / totalWorkDays) * 100),
  }
})

const employeeStats = computed(() => {
  const stats: Record<string, any> = {}

  store.activeEmployees.forEach((employee) => {
    const employeeRecords = monthlyRecords.value.filter((r) => r.employeeId === employee.id)
    const presentDays = employeeRecords.filter((r) => r.checkIn).length
    const totalHours = employeeRecords.reduce((sum, r) => sum + (r.totalHours || 0), 0)
    const avgHours = presentDays > 0 ? totalHours / presentDays : 0

    stats[employee.id] = {
      employee,
      presentDays,
      totalHours: Math.round(totalHours * 100) / 100,
      avgHours: Math.round(avgHours * 100) / 100,
      attendanceRate: Math.round((presentDays / monthlyStats.value.totalDays) * 100),
    }
  })

  return stats
})

const getStatusColor = (rate: number) => {
  if (rate >= 90) return '#27ae60'
  if (rate >= 80) return '#f39c12'
  return '#e74c3c'
}

const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleDateString('ko-KR', {
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  })
}
</script>

<template>
  <div class="reports-page">
    <div class="page-header">
      <h1>근무 보고서</h1>
      <div class="date-selector">
        <select v-model="selectedYear" class="form-select">
          <option v-for="year in [2023, 2024, 2025]" :key="year" :value="year">{{ year }}년</option>
        </select>
        <select v-model="selectedMonth" class="form-select">
          <option v-for="month in 12" :key="month" :value="month">{{ month }}월</option>
        </select>
      </div>
    </div>

    <!-- 월별 통계 -->
    <div class="monthly-stats">
      <h2>{{ selectedYear }}년 {{ selectedMonth }}월 근무 통계</h2>
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-icon">📅</div>
          <div class="stat-content">
            <div class="stat-number">{{ monthlyStats.totalDays }}</div>
            <div class="stat-label">총 근무일</div>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon">👥</div>
          <div class="stat-content">
            <div class="stat-number">{{ monthlyStats.totalEmployees }}</div>
            <div class="stat-label">총 직원수</div>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon">✅</div>
          <div class="stat-content">
            <div class="stat-number">{{ monthlyStats.presentDays }}</div>
            <div class="stat-label">출근일수</div>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon">❌</div>
          <div class="stat-content">
            <div class="stat-number">{{ monthlyStats.absentDays }}</div>
            <div class="stat-label">결근일수</div>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon">📊</div>
          <div class="stat-content">
            <div class="stat-number">{{ monthlyStats.attendanceRate }}%</div>
            <div class="stat-label">출근률</div>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon">⏰</div>
          <div class="stat-content">
            <div class="stat-number">{{ monthlyStats.avgHours }}</div>
            <div class="stat-label">평균 근무시간</div>
          </div>
        </div>
      </div>
    </div>

    <!-- 직원별 통계 -->
    <div class="employee-stats">
      <h2>직원별 근무 현황</h2>
      <div class="employee-table">
        <table>
          <thead>
            <tr>
              <th>직원명</th>
              <th>부서</th>
              <th>출근일수</th>
              <th>총 근무시간</th>
              <th>평균 근무시간</th>
              <th>출근률</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(stats, employeeId) in employeeStats" :key="employeeId">
              <td>{{ stats.employee.name }}</td>
              <td>{{ stats.employee.department }}</td>
              <td>{{ stats.presentDays }}일</td>
              <td>{{ stats.totalHours }}시간</td>
              <td>{{ stats.avgHours }}시간</td>
              <td>
                <span
                  class="attendance-rate"
                  :style="{ color: getStatusColor(stats.attendanceRate) }"
                >
                  {{ stats.attendanceRate }}%
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- 상세 출/퇴근 기록 -->
    <div class="detailed-records">
      <h2>상세 출/퇴근 기록</h2>
      <div v-if="monthlyRecords.length === 0" class="no-records">
        {{ selectedYear }}년 {{ selectedMonth }}월의 출/퇴근 기록이 없습니다.
      </div>
      <div v-else class="records-list">
        <div v-for="record in monthlyRecords" :key="record.id" class="record-item">
          <div class="record-header">
            <div class="record-date">{{ formatDate(record.date) }}</div>
            <div class="employee-name">{{ store.getEmployeeById(record.employeeId)?.name }}</div>
            <div class="record-status" :class="record.status">
              {{
                record.status === 'present'
                  ? '정상출근'
                  : record.status === 'late'
                    ? '지각'
                    : record.status === 'early-leave'
                      ? '조퇴'
                      : '결근'
              }}
            </div>
          </div>

          <div class="record-details">
            <div class="time-info">
              <span v-if="record.checkIn" class="check-in"> 출근: {{ record.checkIn }} </span>
              <span v-if="record.checkOut" class="check-out"> 퇴근: {{ record.checkOut }} </span>
              <span v-if="record.totalHours" class="total-hours">
                근무시간: {{ record.totalHours }}시간
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.reports-page {
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
}

.page-header h1 {
  margin: 0;
  color: #2c3e50;
  font-size: 2rem;
  font-weight: 600;
}

.date-selector {
  display: flex;
  gap: 1rem;
}

.form-select {
  padding: 0.5rem 1rem;
  border: 2px solid #e0e0e0;
  border-radius: 8px;
  font-size: 1rem;
  background: white;
  transition: border-color 0.3s ease;
}

.form-select:focus {
  outline: none;
  border-color: #667eea;
}

.monthly-stats {
  background: rgba(255, 255, 255, 0.9);
  padding: 2rem;
  border-radius: 16px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
  margin-bottom: 2rem;
  width: 100%;
  min-width: 0;
}

.monthly-stats h2 {
  margin: 0 0 1.5rem 0;
  color: #2c3e50;
  font-size: 1.5rem;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1.5rem;
  width: 100%;
  min-width: 0;
}

.stat-card {
  background: rgba(255, 255, 255, 0.8);
  padding: 1.5rem;
  border-radius: 12px;
  display: flex;
  align-items: center;
  gap: 1rem;
  transition: transform 0.3s ease;
  width: 100%;
  min-width: 0;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
}

.stat-card:hover {
  transform: translateY(-2px);
}

.stat-icon {
  font-size: 2rem;
}

.stat-number {
  font-size: 2rem;
  font-weight: 700;
  color: #2c3e50;
  line-height: 1;
}

.stat-label {
  font-size: 1rem;
  color: #7f8c8d;
  margin-top: 0.5rem;
}

.employee-stats {
  background: rgba(255, 255, 255, 0.9);
  padding: 2rem;
  border-radius: 16px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
  margin-bottom: 2rem;
  width: 100%;
  min-width: 0;
}

.employee-stats h2 {
  margin: 0 0 1.5rem 0;
  color: #2c3e50;
  font-size: 1.5rem;
}

.employee-table {
  overflow-x: auto;
  width: 100%;
  min-width: 0;
}

table {
  width: 100%;
  border-collapse: collapse;
  background: white;
  border-radius: 12px;
  overflow: hidden;
}

th,
td {
  padding: 1rem;
  text-align: left;
  border-bottom: 1px solid #e0e0e0;
}

th {
  background: #f8f9fa;
  font-weight: 600;
  color: #2c3e50;
}

td {
  color: #2c3e50;
}

.attendance-rate {
  font-weight: 600;
}

.detailed-records {
  background: rgba(255, 255, 255, 0.9);
  padding: 2rem;
  border-radius: 16px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
  width: 100%;
  min-width: 0;
}

.detailed-records h2 {
  margin: 0 0 1.5rem 0;
  color: #2c3e50;
  font-size: 1.5rem;
}

.no-records {
  text-align: center;
  color: #7f8c8d;
  font-style: italic;
  padding: 2rem;
}

.records-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.record-item {
  background: rgba(255, 255, 255, 0.8);
  border-radius: 12px;
  padding: 1.5rem;
  border-left: 4px solid #667eea;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
}

.record-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.record-date {
  font-weight: 600;
  color: #2c3e50;
}

.employee-name {
  font-weight: 600;
  color: #667eea;
}

.record-status {
  padding: 0.25rem 0.75rem;
  border-radius: 20px;
  font-size: 0.8rem;
  font-weight: 600;
  text-align: center;
}

.record-status.present {
  background: #d4edda;
  color: #155724;
}

.record-status.late {
  background: #fff3cd;
  color: #856404;
}

.record-status.early-leave {
  background: #f8d7da;
  color: #721c24;
}

.record-status.absent {
  background: #f8d7da;
  color: #721c24;
}

.record-details {
  border-top: 1px solid #e0e0e0;
  padding-top: 1rem;
}

.time-info {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
  font-size: 0.9rem;
}

.check-in {
  color: #27ae60;
  font-weight: 500;
}

.check-out {
  color: #e74c3c;
  font-weight: 500;
}

.total-hours {
  color: #7f8c8d;
  font-style: italic;
}

@media (max-width: 768px) {
  .page-header,
  .monthly-stats,
  .employee-stats,
  .detailed-records {
    margin: 0 0 1.5rem 0;
    padding: 1.5rem;
  }

  .page-header {
    flex-direction: column;
    gap: 1rem;
    text-align: center;
    padding: 1.5rem;
  }

  .date-selector {
    flex-direction: column;
  }

  .stats-grid {
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  }

  .record-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.5rem;
  }

  .time-info {
    flex-direction: column;
    gap: 0.5rem;
  }

  table {
    font-size: 0.9rem;
  }

  th,
  td {
    padding: 0.75rem 0.5rem;
  }
}

@media (max-width: 480px) {
  .page-header,
  .monthly-stats,
  .employee-stats,
  .detailed-records {
    margin: 0 0 1rem 0;
    padding: 1rem;
  }

  .page-header {
    padding: 1rem;
  }

  .date-selector {
    flex-direction: column;
  }

  .stats-grid {
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  }

  .record-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.5rem;
  }

  .time-info {
    flex-direction: column;
    gap: 0.5rem;
  }

  table {
    font-size: 0.9rem;
  }

  th,
  td {
    padding: 0.75rem 0.5rem;
  }
}
</style>
