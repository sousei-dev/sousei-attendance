import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase, type Employee, type AttendanceRecord } from '@/lib/supabase'

export const useSupabaseAttendanceStore = defineStore('supabaseAttendance', () => {
  // 상태
  const employees = ref<Employee[]>([])
  const attendanceRecords = ref<AttendanceRecord[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  // 현재 날짜
  const currentDate = computed(() => {
    return new Date().toISOString().split('T')[0]
  })

  // 활성 직원들
  const activeEmployees = computed(() => {
    return employees.value.filter((emp) => emp.is_active && emp.department === 'そうせい岩出')
  })

  // 오늘의 출퇴근 기록
  const todayRecords = computed(() => {
    return attendanceRecords.value.filter((record) => record.date === currentDate.value)
  })

  // 직원별 기록 조회
  const getEmployeeRecord = (employeeId: string, date: string) => {
    return attendanceRecords.value.find(
      (record) => record.employee_id === employeeId && record.date === date,
    )
  }

  // 직원 정보 조회
  const getEmployeeById = (employeeId: string) => {
    return employees.value.find((emp) => emp.id === employeeId)
  }

  // 직원 목록 로드
  const loadEmployees = async () => {
    loading.value = true
    error.value = null

    try {
      const { data, error: supabaseError } = await supabase
        .from('employees')
        .select('*')
        .order('last_name')

      if (supabaseError) throw supabaseError

      employees.value = data || []
    } catch (err) {
      error.value = err instanceof Error ? err.message : '従業員リストの読み込みに失敗しました。'
      console.error('Error loading employees:', err)
    } finally {
      loading.value = false
    }
  }

  // 출퇴근 기록 로드
  const loadAttendanceRecords = async (startDate?: string, endDate?: string) => {
    loading.value = true
    error.value = null

    try {
      let query = supabase
        .from('attendance_records')
        .select('*')
        .order('date', { ascending: false })

      if (startDate) {
        query = query.gte('date', startDate)
      }
      if (endDate) {
        query = query.lte('date', endDate)
      }

      const { data, error: supabaseError } = await query

      if (supabaseError) throw supabaseError

      attendanceRecords.value = data || []
    } catch (err) {
      error.value = err instanceof Error ? err.message : '出退勤記録の読み込みに失敗しました。'
      console.error('Error loading attendance records:', err)
    } finally {
      loading.value = false
    }
  }

  // 출근 처리
  const checkIn = async (employeeId: string, expectedCheckInTime?: string, expectedCheckOutTime?: string, breakTime?: string) => {
    loading.value = true
    error.value = null

    try {
      const now = new Date()
      const checkInTime = now.toTimeString().slice(0, 8) // HH:MM:SS 형식

      // 이미 출근 기록이 있는지 확인
      const existingRecord = getEmployeeRecord(employeeId, currentDate.value)

      if (existingRecord) {
        throw new Error('既に出勤処理されています。')
      }

      // 야간 근무 여부 확인 (18시 이후 출근 또는 06시 이전 출근)
      const isNightShift = now.getHours() >= 18 || now.getHours() < 6
      
      // 야간 근무의 경우 실제 근무 날짜 계산
      let actualWorkDate = currentDate.value
      if (isNightShift && now.getHours() >= 18) {
        // 18시 이후 출근은 다음날까지 근무
        const tomorrow = new Date(now)
        tomorrow.setDate(tomorrow.getDate() + 1)
        actualWorkDate = tomorrow.toISOString().split('T')[0]
      }

      // 출근 시간 기준으로 상태 결정 (예상 출근시간 기준)
      let status: 'present' | 'late' = 'present'
      if (expectedCheckInTime) {
        const expectedTime = new Date(`2000-01-01T${expectedCheckInTime}`)
        const actualTime = new Date(`2000-01-01T${checkInTime}`)
        if (actualTime > expectedTime) {
          status = 'late'
        }
      } else {
        // 야간 근무의 경우 다른 기준 적용
        if (isNightShift) {
          // 야간 근무: 20시 이전 정상, 이후 지각
          const isLate = now.getHours() > 20 || (now.getHours() === 20 && now.getMinutes() > 0)
          status = isLate ? 'late' : 'present'
        } else {
          // 주간 근무: 9시 이전 정상, 이후 지각
          const isLate = now.getHours() > 9 || (now.getHours() === 9 && now.getMinutes() > 0)
          status = isLate ? 'late' : 'present'
        }
      }

      const { data, error: supabaseError } = await supabase
        .from('attendance_records')
        .insert({
          employee_id: employeeId,
          date: actualWorkDate, // 실제 근무 날짜 사용
          check_in: checkInTime,
          check_out: null,
          status,
          scheduled_check_in: expectedCheckInTime || null,
          scheduled_check_out: expectedCheckOutTime || null,
          break_time: breakTime || null, // 휴게시간 추가
          is_night_shift: isNightShift, // 야간 근무 플래그 추가
        })
        .select()
        .single()

      if (supabaseError) throw supabaseError

      // 로컬 상태 업데이트
      attendanceRecords.value.push(data)
    } catch (err) {
      error.value = err instanceof Error ? err.message : '出勤処理に失敗しました。'
      console.error('Error checking in:', err)
      throw err
    } finally {
      loading.value = false
    }
  }

  // 퇴근 처리
  const checkOut = async (employeeId: string) => {
    loading.value = true
    error.value = null

    try {
      const now = new Date()
      const checkOutTime = now.toTimeString().slice(0, 8) // HH:MM:SS 형식

      // 출근 기록 찾기 (야간 근무 고려)
      let record = getEmployeeRecord(employeeId, currentDate.value)
      
      // 오늘 기록이 없으면 어제 기록 확인 (야간 근무의 경우)
      if (!record) {
        const yesterday = new Date(now)
        yesterday.setDate(yesterday.getDate() - 1)
        const yesterdayDate = yesterday.toISOString().split('T')[0]
        record = getEmployeeRecord(employeeId, yesterdayDate)
        
        // 어제 기록도 없으면 이전 날짜들 확인 (최대 3일 전까지)
        if (!record) {
          for (let i = 2; i <= 3; i++) {
            const previousDate = new Date(now)
            previousDate.setDate(previousDate.getDate() - i)
            const previousDateStr = previousDate.toISOString().split('T')[0]
            record = getEmployeeRecord(employeeId, previousDateStr)
            if (record && record.check_in && !record.check_out) {
              break
            }
          }
        }
      }

      if (!record || !record.check_in) {
        throw new Error('出勤記録がありません。')
      }

      if (record.check_out) {
        throw new Error('既に退勤処理されています。')
      }

      // 근무 시간 계산 (야간 근무 고려)
      const checkInTime = new Date(`2000-01-01T${record.check_in}`)
      const checkOutTimeObj = new Date(`2000-01-01T${checkOutTime}`)
      
      let totalMinutes = (checkOutTimeObj.getTime() - checkInTime.getTime()) / (1000 * 60)
      
      // 야간 근무의 경우 시간 계산 조정
      if (record.is_night_shift) {
        // 퇴근시간이 출근시간보다 작으면 다음날로 간주
        if (totalMinutes <= 0) {
          totalMinutes += 24 * 60 // 24시간 추가
        }
      }
      
      // 휴게시간 제외
      let breakMinutes = 0
      if (record.break_time) {
        const [breakHours, breakMins] = record.break_time.split(':').map(Number)
        breakMinutes = breakHours * 60 + breakMins
      }
      
      // 순수 근무시간 계산 (휴게시간 제외)
      const workMinutes = totalMinutes - breakMinutes
      const totalHours = Math.floor(workMinutes / 60) + Math.round((workMinutes % 60) / 30) * 0.5

      // 조퇴 여부 확인 (예상 퇴근시간 기준)
      let status = record.status
      if (record.scheduled_check_out) {
        const expectedTime = new Date(`2000-01-01T${record.scheduled_check_out}`)
        const actualTime = new Date(`2000-01-01T${checkOutTime}`)
        
        // 야간 근무의 경우 조퇴 판단 기준 조정
        if (record.is_night_shift) {
          // 야간 근무: 06시 이전 퇴근 시 조퇴
          const isEarlyLeave = now.getHours() < 6
          if (isEarlyLeave && status === 'present') {
            status = 'early-leave'
          }
        } else {
          // 주간 근무: 기존 로직
          if (actualTime < expectedTime && status === 'present') {
            status = 'early-leave'
          }
        }
      } else {
        // 기본값: 야간/주간 근무에 따른 조퇴 판단
        if (record.is_night_shift) {
          // 야간 근무: 06시 이전 퇴근
          const isEarlyLeave = now.getHours() < 6
          if (isEarlyLeave && status === 'present') {
            status = 'early-leave'
          }
        } else {
          // 주간 근무: 18시 이전 퇴근
          const isEarlyLeave = now.getHours() < 18
          if (isEarlyLeave && status === 'present') {
            status = 'early-leave'
          }
        }
      }

      const { data, error: supabaseError } = await supabase
        .from('attendance_records')
        .update({
          check_out: checkOutTime,
          status,
        })
        .eq('id', record.id)
        .select()
        .single()

      if (supabaseError) throw supabaseError

      // 로컬 상태 업데이트
      const index = attendanceRecords.value.findIndex((r) => r.id === record.id)
      if (index !== -1) {
        attendanceRecords.value[index] = data
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : '退勤処理に失敗しました。'
      console.error('Error checking out:', err)
      throw err
    } finally {
      loading.value = false
    }
  }

  // 직원 추가
  const addEmployee = async (employeeData: Omit<Employee, 'id' | 'created_at' | 'updated_at'>) => {
    loading.value = true
    error.value = null

    try {
      const { data, error: supabaseError } = await supabase
        .from('employees')
        .insert(employeeData)
        .select()
        .single()

      if (supabaseError) throw supabaseError

      employees.value.push(data)
      return data
    } catch (err) {
      error.value = err instanceof Error ? err.message : '従業員の追加に失敗しました。'
      console.error('Error adding employee:', err)
      throw err
    } finally {
      loading.value = false
    }
  }

  // 직원 수정
  const updateEmployee = async (
    id: string,
    employeeData: Partial<Omit<Employee, 'id' | 'created_at' | 'updated_at'>>,
  ) => {
    loading.value = true
    error.value = null

    try {
      const { data, error: supabaseError } = await supabase
        .from('employees')
        .update(employeeData)
        .eq('id', id)
        .select()
        .single()

      if (supabaseError) throw supabaseError

      const index = employees.value.findIndex((emp) => emp.id === id)
      if (index !== -1) {
        employees.value[index] = data
      }
      return data
    } catch (err) {
      error.value = err instanceof Error ? err.message : '従業員の更新に失敗しました。'
      console.error('Error updating employee:', err)
      throw err
    } finally {
      loading.value = false
    }
  }

  // 직원 삭제 (비활성화)
  const deactivateEmployee = async (id: string) => {
    loading.value = true
    error.value = null

    try {
      const { data, error: supabaseError } = await supabase
        .from('employees')
        .update({ is_active: false })
        .eq('id', id)
        .select()
        .single()

      if (supabaseError) throw supabaseError

      const index = employees.value.findIndex((emp) => emp.id === id)
      if (index !== -1) {
        employees.value[index] = data
      }
      return data
    } catch (err) {
      error.value = err instanceof Error ? err.message : '従業員の無効化に失敗しました。'
      console.error('Error deactivating employee:', err)
      throw err
    } finally {
      loading.value = false
    }
  }

  // 월별 보고서 조회
  const getMonthlyReport = (year: number, month: number) => {
    const startDate = `${year}-${month.toString().padStart(2, '0')}-01`
    const endDate = `${year}-${month.toString().padStart(2, '0')}-31`

    return attendanceRecords.value.filter(
      (record) => record.date >= startDate && record.date <= endDate,
    )
  }

  // 초기 데이터 로드
  const initialize = async () => {
    await Promise.all([loadEmployees(), loadAttendanceRecords()])
  }

  return {
    // 상태
    employees,
    attendanceRecords,
    loading,
    error,
    currentDate,

    // 계산된 속성
    activeEmployees,
    todayRecords,

    // 메서드
    getEmployeeRecord,
    getEmployeeById,
    loadEmployees,
    loadAttendanceRecords,
    checkIn,
    checkOut,
    addEmployee,
    updateEmployee,
    deactivateEmployee,
    getMonthlyReport,
    initialize,
  }
})
