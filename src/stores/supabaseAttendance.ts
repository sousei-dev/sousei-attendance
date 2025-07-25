import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase, type Employee, type AttendanceRecord, type Facility, type Company } from '@/lib/supabase'
import { useAuthStore } from './auth'

export const useSupabaseAttendanceStore = defineStore('supabaseAttendance', () => {
  // 상태
  const employees = ref<Employee[]>([])
  const attendanceRecords = ref<AttendanceRecord[]>([])
  const facilities = ref<Facility[]>([])
  const companies = ref<Company[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  // auth store 가져오기
  const authStore = useAuthStore()

  // 현재 날짜 (로컬 시간 기준)
  const currentDate = computed(() => {
    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const day = String(now.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  })

  // 활성 직원들 (role과 facility_id에 따라 필터링)
  const activeEmployees = computed(() => {
    const filteredEmployees = employees.value.filter((emp) => emp.is_active)
    
    // admin이면 모든 직원 반환 (facility_id 기준으로 정렬)
    if (authStore.isAdmin) {
      return filteredEmployees
    }
    
    // staff이면 facility_id로 필터링 (이미 정렬됨)
    if (authStore.isStaff && authStore.user?.facility_id) {
      return filteredEmployees.filter(emp => emp.facility_id === authStore.user?.facility_id && emp.company_id === authStore.user?.company_id)
    }
    
    // 일반 사용자이거나 facility_id가 없는 경우 빈 배열 반환
    return []
  })

  // 오늘의 출퇴근 기록 (야간 근무 고려)
  const todayRecords = computed(() => {
    const now = new Date()
    const currentHour = now.getHours()
    
    let targetDate = currentDate.value
    
    // 06시 이전: 전날 야간 근무 기록
    if (currentHour < 6) {
      const yesterday = new Date(now)
      yesterday.setDate(yesterday.getDate() - 1)
      const year = yesterday.getFullYear()
      const month = String(yesterday.getMonth() + 1).padStart(2, '0')
      const day = String(yesterday.getDate()).padStart(2, '0')
      targetDate = `${year}-${month}-${day}`
    }
    
    // 16:30 이후: 다음날 야간 근무 기록
    if (currentHour >= 16) {
      const tomorrow = new Date(now)
      tomorrow.setDate(tomorrow.getDate() + 1)
      const year = tomorrow.getFullYear()
      const month = String(tomorrow.getMonth() + 1).padStart(2, '0')
      const day = String(tomorrow.getDate()).padStart(2, '0')
      const tomorrowDate = `${year}-${month}-${day}`
      
      // 오늘 일반 근무 기록 (퇴근한 사람들 포함)
      const todayRecords = attendanceRecords.value.filter((record) => 
        record.date === currentDate.value && 
        !record.is_night_shift
      )
      
      // 다음날 야간 근무 기록
      const tomorrowNightRecords = attendanceRecords.value.filter((record) => 
        record.date === tomorrowDate && 
        record.is_night_shift
      )
      
      return [...todayRecords, ...tomorrowNightRecords]
    }
    
    // 6시~16:30 사이: 오늘 기록 + 전날 야간 근무 기록 (아직 퇴근하지 않은 사람들만)
    if (currentHour >= 6 && currentHour < 16) {
      const yesterday = new Date(now)
      yesterday.setDate(yesterday.getDate() - 1)
      const year = yesterday.getFullYear()
      const month = String(yesterday.getMonth() + 1).padStart(2, '0')
      const day = String(yesterday.getDate()).padStart(2, '0')
      const yesterdayDate = `${year}-${month}-${day}`
      
      // 오늘 기록
      const todayRecords = attendanceRecords.value.filter((record) => record.date === targetDate)
      
      // 전날 야간 근무 기록 (아직 퇴근하지 않은 사람들만)
      const yesterdayNightRecords = attendanceRecords.value.filter((record) => 
        record.date === yesterdayDate && 
        record.is_night_shift && 
        record.check_in && 
        !record.check_out
      )
      
      return [...todayRecords, ...yesterdayNightRecords]
    }
    
    // 해당 날짜의 기록만 반환
    return attendanceRecords.value.filter((record) => record.date === targetDate)
  })

  // 직원별 기록 조회 (야간 근무 고려)
  const getEmployeeRecord = (employeeId: string, date: string): AttendanceRecord | null => {
    // 전달받은 날짜의 기록을 우선적으로 찾기
    const record = attendanceRecords.value.find(
      (r) => r.employee_id === employeeId && r.date === date
    )
    
    return record || null
  }

  // 직원 정보 조회
  const getEmployeeById = (employeeId: string) => {
    return employees.value.find((emp) => emp.id === employeeId)
  }

  // 회사별 직원 목록 조회
  const getEmployeeByCompanyId = (companyId: string) => {
    return employees.value.filter((emp) => emp.company_id === companyId && emp.is_active)
  }

  // 직원 목록 로드
  const loadEmployees = async () => {
    try {
      const query = supabase
        .from('employees')
        .select('*')
        .order('employee_code')
      
      const { data, error: supabaseError } = await query
      
      if (supabaseError) {
        throw supabaseError
      }

      employees.value = data || []
    } catch (err) {
      error.value = err instanceof Error ? err.message : '従業員リストの読み込みに失敗しました。'
      console.error('Error loading employees:', err)
      throw err
    }
  }

  // 직원 목록 로드
  const loadCompanies = async () => {
    try {
      const query = supabase
        .from('companies')
        .select('*')
        .order('created_at', { ascending: false })
      
      const { data, error: supabaseError } = await query
      
      if (supabaseError) {
        throw supabaseError
      }

      companies.value = data || []
    } catch (err) {
      error.value = err instanceof Error ? err.message : '会社リストの読み込みに失敗しました。'
      console.error('Error loading companies:', err)
      throw err
    }
  }

  // 출퇴근 기록 로드
  const loadAttendanceRecords = async (startDate?: string, endDate?: string) => {
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
      
      if (supabaseError) {
        throw supabaseError
      }

      attendanceRecords.value = data || []
    } catch (err) {
      error.value = err instanceof Error ? err.message : '出退勤記録の読み込みに失敗しました。'
      console.error('Error loading attendance records:', err)
      throw err
    }
  }

  // 출근 처리
  const checkIn = async (
    employeeId: string, 
    scheduledCheckIn?: string, 
    scheduledCheckOut?: string, 
    breakTime?: string
  ) => {
    loading.value = true
    error.value = null

    try {
      const now = new Date()
      const checkInTime = now.toTimeString().slice(0, 8) // HH:MM:SS 형식
      const currentHour = now.getHours()

      // 현재 시간에 따라 적절한 날짜 설정
      let targetDate = currentDate.value
      
      // 16:30 이후: 다음날 야간 근무
      if (currentHour >= 16) {
        const tomorrow = new Date(now)
        tomorrow.setDate(tomorrow.getDate() + 1)
        const year = tomorrow.getFullYear()
        const month = String(tomorrow.getMonth() + 1).padStart(2, '0')
        const day = String(tomorrow.getDate()).padStart(2, '0')
        targetDate = `${year}-${month}-${day}`
      }
      
      // 06시 이전: 전날 야간 근무
      if (currentHour < 6) {
        const yesterday = new Date(now)
        yesterday.setDate(yesterday.getDate() - 1)
        const year = yesterday.getFullYear()
        const month = String(yesterday.getMonth() + 1).padStart(2, '0')
        const day = String(yesterday.getDate()).padStart(2, '0')
        targetDate = `${year}-${month}-${day}`
      }

      // 중복 출근 확인 (야간 근무 고려)
      let existingRecord = attendanceRecords.value.find(
        (r) => r.employee_id === employeeId && 
               r.date === targetDate &&
               r.check_in
      )
      
      // 야간 근무자의 경우 추가 확인
      if (!existingRecord) {
        // 전날 야간 근무 기록 확인
        const yesterday = new Date(now)
        yesterday.setDate(yesterday.getDate() - 1)
        const year = yesterday.getFullYear()
        const month = String(yesterday.getMonth() + 1).padStart(2, '0')
        const day = String(yesterday.getDate()).padStart(2, '0')
        const yesterdayDate = `${year}-${month}-${day}`
        existingRecord = attendanceRecords.value.find(
          (r) => r.employee_id === employeeId && 
                 r.date === yesterdayDate &&
                 r.is_night_shift &&
                 r.check_in
        )
      }
      
      // 다음날 야간 근무 기록 확인
      if (!existingRecord) {
        const tomorrow = new Date(now)
        tomorrow.setDate(tomorrow.getDate() + 1)
        const year = tomorrow.getFullYear()
        const month = String(tomorrow.getMonth() + 1).padStart(2, '0')
        const day = String(tomorrow.getDate()).padStart(2, '0')
        const tomorrowDate = `${year}-${month}-${day}`
        existingRecord = attendanceRecords.value.find(
          (r) => r.employee_id === employeeId && 
                 r.date === tomorrowDate &&
                 r.is_night_shift &&
                 r.check_in
        )
      }

      if (existingRecord) {
        throw new Error('既に出勤処理されています。')
      }

      // 야간 근무 여부 확인 (예상 출근시간 기준)
      let isNightShift = false
      
      if (scheduledCheckIn) {
        // 시간 문자열에서 시간과 분을 직접 추출
        const timeParts = scheduledCheckIn.split(':')
        const hours = parseInt(timeParts[0], 10)
        const minutes = parseInt(timeParts[1], 10)
        const scheduledMinutes = hours * 60 + minutes
        
        console.log('=== 야간 근무 디버깅 ===')
        console.log('scheduledCheckIn:', scheduledCheckIn)
        console.log('scheduledMinutes:', scheduledMinutes)
        console.log('16:30 분:', 16 * 60 + 30)
        console.log('09:30분:', 9 * 60 + 30)
        console.log('조건1 (>= 16:30, scheduledMinutes >= 16 * 60 + 30):', scheduledMinutes >= 16 * 60 + 30)
        console.log('조건2 (<= 09:30, scheduledMinutes <= 9 * 60 + 30):', scheduledMinutes <= 9 * 60 + 30)
        
        // 야간 근무 판단: 예상 출근시간이 16:30이고 예상 퇴근시간이 09:30인 경우
        const nineThirtyMinutes = 9 * 60 + 30  // 09:30
        const sixteenThirtyMinutes = 16 * 60 + 30  // 16:30
        
        if (scheduledCheckOut) {
          const checkOutParts = scheduledCheckOut.split(':')
          const checkOutHours = parseInt(checkOutParts[0], 10)
          const checkOutMinutes = parseInt(checkOutParts[1], 10)
          const scheduledCheckOutMinutes = checkOutHours * 60 + checkOutMinutes
          
          // 야간 근무 조건: 출근시간이 16:30이고 퇴근시간이 09:30인 경우
          isNightShift = scheduledMinutes === sixteenThirtyMinutes && scheduledCheckOutMinutes === nineThirtyMinutes
        } else {
          // 퇴근시간이 없으면 출근시간만으로 판단
          isNightShift = scheduledMinutes === sixteenThirtyMinutes
        }
        console.log('isNightShift:', isNightShift)
        console.log('=== 야간 근무 디버깅 끝 ===')
      } else {
        // 예상 출근시간이 없으면 실제 출근시간 기준
        const currentMinutes = now.getHours() * 60 + now.getMinutes()
        isNightShift = currentMinutes >= 16 * 60 || currentMinutes < 6 * 60 //16:30또는 6
      }

      // 주간/야간 관계없이 오늘 날짜로 설정
      const actualWorkDate = currentDate.value

      // 출근 시간 기준으로 상태 결정
      let status: 'present' | 'late' = 'present'
      
      // scheduledCheckIn이 있는 경우 해당 시간 기준으로 지각 여부 판단
      if (scheduledCheckIn) {
        const scheduledTime = new Date(`2000-01-01T${scheduledCheckIn}`)
        const actualTime = new Date(`2000-01-01T${checkInTime}`)
        
        // 실제 출근시간이 예상 출근시간보다 늦으면 지각
        if (actualTime.getTime() > scheduledTime.getTime()) {
          status = 'late'
        } else {
          status = 'present'
        }
      } else {
        // scheduledCheckIn이 없는 경우 정상으로 처리
        status = 'present'
      }

      const { data, error: supabaseError } = await supabase
        .from('attendance_records')
        .insert({
          employee_id: employeeId,
          date: actualWorkDate, // 실제 근무 날짜 사용
          check_in: checkInTime,
          check_out: null,
          status,
          scheduled_check_in: scheduledCheckIn || null,
          scheduled_check_out: scheduledCheckOut || null,
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

      let record: AttendanceRecord | undefined = undefined
      
      // 먼저 오늘 기록 확인
      record = attendanceRecords.value.find(
        (r) => r.employee_id === employeeId && 
               r.date === currentDate.value &&
               r.check_in && 
               !r.check_out
      )
      
      // 오늘 기록이 없으면 전날 야간 근무 기록 확인 (퇴근하지 않은 경우)
      if (!record) {
        const yesterday = new Date(now)
        yesterday.setDate(yesterday.getDate() - 1)
        const yesterdayDate = yesterday.toISOString().split('T')[0]
        record = attendanceRecords.value.find(
          (r) => r.employee_id === employeeId && 
                 r.date === yesterdayDate &&
                 r.is_night_shift &&
                 r.check_in && 
                 !r.check_out
        )
      }
      
      // 여전히 기록이 없으면 다음날 야간 근무 기록 확인 (이미 출근한 경우)
      if (!record) {
        const tomorrow = new Date(now)
        tomorrow.setDate(tomorrow.getDate() + 1)
        const tomorrowDate = tomorrow.toISOString().split('T')[0]
        record = attendanceRecords.value.find(
          (r) => r.employee_id === employeeId && 
                 r.date === tomorrowDate &&
                 r.is_night_shift &&
                 r.check_in && 
                 !r.check_out
        )
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

  // facility 이름 가져오기
  const getFacilityName = (facilityId: string) => {
    const facility = facilities.value.find(f => f.id === facilityId)
    return facility?.name || facilityId
  }

  // facility 목록 로드
  const loadFacilities = async () => {
    try {
      const { data, error: supabaseError } = await supabase
        .from('facilities')
        .select('*')
        .order('id')

      if (supabaseError) throw supabaseError

      facilities.value = data || []
    } catch (err) {
      console.error('Error loading facilities:', err)
      // facility 로딩 실패는 치명적이지 않으므로 에러를 던지지 않음
    }
  }

  // 초기 데이터 로드
  const initialize = async () => {
    // 이미 로딩 중이면 중복 실행 방지
    if (loading.value) {
      return
    }
    
    // 이미 데이터가 로드되어 있는지 확인
    if (employees.value.length > 0 && attendanceRecords.value.length > 0) {
      return
    }
    
    loading.value = true
    error.value = null
    
    try {
      await Promise.all([loadEmployees(), loadCompanies(), loadAttendanceRecords(), loadFacilities()])
    } catch (err) {
      error.value = err instanceof Error ? err.message : '初期化に失敗しました。'
      console.error('Initialization error:', err)
    } finally {
      loading.value = false
    }
  }

  return {
    // 상태
    employees,
    companies,
    attendanceRecords,
    facilities,
    loading,
    error,
    currentDate,

    // 계산된 속성
    activeEmployees,
    todayRecords,

    // 메서드
    getEmployeeRecord,
    getEmployeeById,
    getEmployeeByCompanyId,
    getFacilityName,
    loadEmployees,
    loadCompanies,
    loadAttendanceRecords,
    loadFacilities,
    checkIn,
    checkOut,
    addEmployee,
    updateEmployee,
    deactivateEmployee,
    getMonthlyReport,
    initialize,
  }
})
