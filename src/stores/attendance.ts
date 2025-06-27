import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export interface Employee {
  id: string
  name: string
  department: string
  position: string
  employeeNumber: string
  isActive: boolean,
  salary_type: 'hourly' | 'monthly'
}

export interface AttendanceRecord {
  id: string
  employeeId: string
  date: string
  checkIn: string | null
  checkOut: string | null
  totalHours: number | null
  status: 'present' | 'absent' | 'late' | 'early-leave'
}

export const useAttendanceStore = defineStore('attendance', () => {
  // 직원 목록
  const employees = ref<Employee[]>([
    {
      id: '1',
      name: '김철수',
      department: '개발팀',
      position: '시니어 개발자',
      employeeNumber: 'EMP001',
      isActive: true,
    },
    {
      id: '2',
      name: '이영희',
      department: '디자인팀',
      position: 'UI/UX 디자이너',
      employeeNumber: 'EMP002',
      isActive: true,
    },
    {
      id: '3',
      name: '박민수',
      department: '마케팅팀',
      position: '마케팅 매니저',
      employeeNumber: 'EMP003',
      isActive: true,
    },
  ])

  // 출/퇴근 기록
  const attendanceRecords = ref<AttendanceRecord[]>([])

  // 현재 날짜
  const currentDate = ref(new Date().toISOString().split('T')[0])

  // Getters
  const activeEmployees = computed(() => employees.value.filter((emp) => emp.isActive))

  const todayRecords = computed(() =>
    attendanceRecords.value.filter((record) => record.date === currentDate.value),
  )

  const getEmployeeById = (id: string) => employees.value.find((emp) => emp.id === id)

  const getEmployeeRecord = (employeeId: string, date: string) =>
    attendanceRecords.value.find(
      (record) => record.employeeId === employeeId && record.date === date,
    )

  // Actions
  const addEmployee = (employee: Omit<Employee, 'id'>) => {
    const newEmployee: Employee = {
      ...employee,
      id: Date.now().toString(),
      isActive: true,
    }
    employees.value.push(newEmployee)
  }

  const updateEmployee = (id: string, updates: Partial<Employee>) => {
    const index = employees.value.findIndex((emp) => emp.id === id)
    if (index !== -1) {
      employees.value[index] = { ...employees.value[index], ...updates }
    }
  }

  const deleteEmployee = (id: string) => {
    const index = employees.value.findIndex((emp) => emp.id === id)
    if (index !== -1) {
      employees.value[index].isActive = false
    }
  }

  const checkIn = (employeeId: string) => {
    const now = new Date()
    const timeString = now.toTimeString().split(' ')[0]

    const existingRecord = getEmployeeRecord(employeeId, currentDate.value)

    if (existingRecord) {
      // 이미 출근 기록이 있는 경우
      if (existingRecord.checkIn) {
        throw new Error('이미 출근 처리되었습니다.')
      }
      existingRecord.checkIn = timeString
    } else {
      // 새로운 출근 기록 생성
      const newRecord: AttendanceRecord = {
        id: Date.now().toString(),
        employeeId,
        date: currentDate.value,
        checkIn: timeString,
        checkOut: null,
        totalHours: null,
        status: 'present',
      }
      attendanceRecords.value.push(newRecord)
    }
  }

  const checkOut = (employeeId: string) => {
    const now = new Date()
    const timeString = now.toTimeString().split(' ')[0]

    const record = getEmployeeRecord(employeeId, currentDate.value)

    if (!record) {
      throw new Error('출근 기록이 없습니다.')
    }

    if (!record.checkIn) {
      throw new Error('출근 기록이 없습니다.')
    }

    if (record.checkOut) {
      throw new Error('이미 퇴근 처리되었습니다.')
    }

    record.checkOut = timeString

    // 근무 시간 계산
    const checkInTime = new Date(`${record.date}T${record.checkIn}`)
    const checkOutTime = new Date(`${record.date}T${record.checkOut}`)
    const diffMs = checkOutTime.getTime() - checkInTime.getTime()
    const diffHours = diffMs / (1000 * 60 * 60)

    record.totalHours = Math.round(diffHours * 100) / 100

    // 상태 업데이트 (8시간 기준)
    if (diffHours < 8) {
      record.status = 'early-leave'
    }
  }

  const getMonthlyReport = (year: number, month: number) => {
    const startDate = new Date(year, month - 1, 1).toISOString().split('T')[0]
    const endDate = new Date(year, month, 0).toISOString().split('T')[0]

    return attendanceRecords.value.filter(
      (record) => record.date >= startDate && record.date <= endDate,
    )
  }

  return {
    // State
    employees,
    attendanceRecords,
    currentDate,

    // Getters
    activeEmployees,
    todayRecords,
    getEmployeeById,
    getEmployeeRecord,

    // Actions
    addEmployee,
    updateEmployee,
    deleteEmployee,
    checkIn,
    checkOut,
    getMonthlyReport,
  }
})
