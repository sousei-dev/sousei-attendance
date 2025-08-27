import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase, type Employee, type AttendanceRecord, type Facility, type Company, type CompanyFacility } from '@/lib/supabase'
import { useAuthStore } from './auth'

export const useSupabaseAttendanceStore = defineStore('supabaseAttendance', () => {
  // 상태
  const employees = ref<Employee[]>([])
  const attendanceRecords = ref<AttendanceRecord[]>([])
  const facilities = ref<Facility[]>([])
  const companies = ref<Company[]>([])
  const companyFacilities = ref<CompanyFacility[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)



  // auth store 가져오기
  const authStore = useAuthStore()

  // 현재 날짜
  const currentDate = computed(() => {
    const now = new Date()
    const utcYear = now.getFullYear()
    const utcMonth = String(now.getMonth() + 1).padStart(2, '0')
    const utcDay = String(now.getDate()).padStart(2, '0')
    return `${utcYear}-${utcMonth}-${utcDay}`
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
        .eq('is_deleted', false)
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

      // 출근 시점의 정확한 날짜 사용 (UTC 기준)
      const actualWorkDate = now.toISOString().split('T')[0]
      
      console.log('=== 출근 날짜 디버깅 ===')
      console.log('현재 시간:', now)
      console.log('currentDate.value:', currentDate.value)
      console.log('actualWorkDate:', actualWorkDate)
      console.log('=== 출근 날짜 디버깅 끝 ===')

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
          date: currentDate.value, // 실제 근무 날짜 사용
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

      if (supabaseError) {
        throw supabaseError
      }

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

      if (supabaseError) {
        throw supabaseError
      }

      // 로컬 상태 업데이트
      const index = attendanceRecords.value.findIndex((r) => r.id === record.id)
      if (index !== -1) {
        attendanceRecords.value[index] = data
      } else {
        // 인덱스를 찾지 못한 경우 배열에 추가
        attendanceRecords.value.push(data)
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

      if (supabaseError) {
        throw supabaseError
      }

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

      if (supabaseError) {
        throw supabaseError
      }

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

      if (supabaseError) {

        throw supabaseError
      }

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

      if (supabaseError) {
        console.log('Supabase 에러 발생:', supabaseError)
        // 인증 관련 에러인 경우 로그인 페이지로 리다이렉트
        if (supabaseError.code === 'PGRST301' || 
            supabaseError.message?.includes('JWT') || 
            supabaseError.message?.includes('authentication')) {
          console.error('인증 만료 감지 - 로그인 페이지로 이동')
          window.location.href = '/login'
          return
        }
        throw supabaseError
      }

      facilities.value = data || []
    } catch (err) {
      console.error('Error loading facilities:', err)
      // facility 로딩 실패는 치명적이지 않으므로 에러를 던지지 않음
    }
  }

  // company_facilities 목록 로드
  const loadCompanyFacilities = async () => {
    try {
      const { data, error: supabaseError } = await supabase
        .from('company_facilities')
        .select('*')
        .order('company_id')

      if (supabaseError) {
        console.log('Supabase 에러 발생:', supabaseError)
        // 인증 관련 에러인 경우 로그인 페이지로 리다이렉트
        if (supabaseError.code === 'PGRST301' || 
            supabaseError.message?.includes('JWT') || 
            supabaseError.message?.includes('authentication')) {
          console.error('인증 만료 감지 - 로그인 페이지로 이동')
          window.location.href = '/login'
          return
        }
        throw supabaseError
      }

      companyFacilities.value = data || []
    } catch (err) {
      console.error('Error loading company facilities:', err)
      // company_facilities 로딩 실패는 치명적이지 않으므로 에러를 던지지 않음
    }
  }

  // 회사별 시설 목록 가져오기
  const getFacilitiesByCompany = (companyId: string) => {
    if (!companyId) return []
    
    const companyFacilityIds = companyFacilities.value
      .filter(cf => cf.company_id === companyId)
      .map(cf => cf.facility_id)
    
    return facilities.value.filter(facility => 
      companyFacilityIds.includes(facility.id)
    )
  }

  // 시설별 직원 목록 가져오기
  const getEmployeesByFacility = (facilityId: string) => {
    if (!facilityId) return []
    
    return employees.value.filter(emp => 
      emp.facility_id === facilityId && emp.is_active
    )
  }

  // 시설별 개별 직원 근무 통계 계산
  const getFacilityEmployeeWorkStats = async (facilityId: string, selectedMonth: string) => {
    if (!facilityId || !selectedMonth) return null
    
    const facilityEmployees = getEmployeesByFacility(facilityId)
    if (facilityEmployees.length === 0) return null
    
    // 특별한 회사 ID 확인 (휴일출근시간 계산하지 않는 회사)
    const isSpecialCompany = facilityEmployees.some(emp => {
      const company = companies.value.find(c => c.id === emp.company_id)
      return company?.is_special_company || false
    })
    
    // 공휴일 데이터 가져오기
    const holidays: string[] = []
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
          return Object.keys(data)
        } else {
          throw new Error('Invalid data format')
        }
      } catch (error) {
        console.error('공휴일 데이터 가져오기 실패:', error)
        // API 실패 시 기본 공휴일 사용
        return [
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
    
    // 급여 기간에 해당하는 연도의 공휴일을 모두 가져오기
    const loadHolidaysForPeriod = async () => {
      const [year] = selectedMonth.split('-')
      const currentYear = parseInt(year)
      
      // 이전 연도, 현재 연도, 다음 연도의 공휴일을 모두 가져오기
      const yearsToFetch = [currentYear - 1, currentYear, currentYear + 1]
      
      for (const yearToFetch of yearsToFetch) {
        try {
          const holidayData = await fetchHolidays(yearToFetch)
          holidays.push(...holidayData)
        } catch (error) {
          console.error(`${yearToFetch}년 공휴일 로드 실패:`, error)
        }
      }
      
      // 중복 제거
      const uniqueHolidays = [...new Set(holidays)]
      holidays.length = 0
      holidays.push(...uniqueHolidays)
      
      console.log('로드된 공휴일:', holidays)
    }
    
    // 공휴일 데이터를 동기적으로 로드
    await loadHolidaysForPeriod()
    
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
    
    // 출근시간을 30분 단위로 올림하는 함수
    const roundUpToNearestHalfHour = (timeStr: string) => {
      const [hours, minutes] = timeStr.split(':').map(Number)
      
      // 30분 단위로 올림 (1-30분은 30분, 31-59분은 다음시간 00분)
      let roundedMinutes
      if (minutes === 0) {
        // 정각이면 그대로
        roundedMinutes = hours * 60
      } else if (minutes <= 30) {
        // 1-30분은 30분으로 올림
        roundedMinutes = hours * 60 + 30
      } else {
        // 31-59분은 다음시간 00분으로 올림
        roundedMinutes = (hours + 1) * 60
      }
      
      const roundedHours = Math.floor(roundedMinutes / 60)
      const roundedMins = roundedMinutes % 60
      
      return `${roundedHours.toString().padStart(2, '0')}:${roundedMins.toString().padStart(2, '0')}`
    }
    
    // 퇴근시간을 30분 단위로 내림하는 함수
    const roundDownToNearestHalfHour = (timeStr: string) => {
      const [hours, minutes] = timeStr.split(':').map(Number)
      
      // 30분 단위로 내림 (1-29분은 00분, 30-59분은 30분)
      let roundedMinutes
      if (minutes === 0) {
        // 정각이면 그대로
        roundedMinutes = hours * 60
      } else if (minutes < 30) {
        // 1-29분은 00분으로 내림
        roundedMinutes = hours * 60
      } else {
        // 30-59분은 30분으로 내림
        roundedMinutes = hours * 60 + 30
      }
      
      const roundedHours = Math.floor(roundedMinutes / 60)
      const roundedMins = roundedMinutes % 60
      
      return `${roundedHours.toString().padStart(2, '0')}:${roundedMins.toString().padStart(2, '0')}`
    }
    
    // 근무시간 계산 함수 (출퇴근 시간 기반, 30분 단위 조정)
    const calculateWorkHours = (checkInTime: string | null, checkOutTime: string | null, scheduledCheckIn: string | null = null, scheduledCheckOut: string | null = null) => {
      if (!checkInTime || !checkOutTime) return 0
      
      let adjustedCheckIn = checkInTime
      let adjustedCheckOut = checkOutTime
      
      // 예상 출근시간이 있고, 실제 출근시간이 예상시간과 다르면 조정
      if (scheduledCheckIn) {
        if (checkInTime > scheduledCheckIn) {
          // 실제 출근시간이 늦으면 30분 단위로 올림
          adjustedCheckIn = roundUpToNearestHalfHour(checkInTime)
        } else if (checkInTime < scheduledCheckIn) {
          // 실제 출근시간이 빠르면 예상시간으로 조정
          adjustedCheckIn = scheduledCheckIn
        }
      }
      
      // 예상 퇴근시간이 있고, 실제 퇴근시간이 늦으면 30분 단위로 내림
      if (scheduledCheckOut && checkOutTime > scheduledCheckOut) {
        adjustedCheckOut = roundDownToNearestHalfHour(checkOutTime)
      }
      
      // 조정된 시간을 직접 분으로 변환 (반올림 없이)
      const getMinutesFromAdjustedTime = (timeStr: string) => {
        const [hours, minutes] = timeStr.split(':').map(Number)
        return hours * 60 + minutes
      }
      
      const checkInMinutes = getMinutesFromAdjustedTime(adjustedCheckIn)
      const checkOutMinutes = getMinutesFromAdjustedTime(adjustedCheckOut)
      
      // 퇴근시간이 출근시간보다 작으면 다음날로 간주 (야간근무)
      let workMinutes = checkOutMinutes - checkInMinutes
      if (workMinutes <= 0) {
        workMinutes += 24 * 60 // 24시간 추가
      }
      
      const workHours = workMinutes / 60
      
      return workHours
    }
    
    // 야간근무 여부 확인 (예상 출근시간이 16:30이고 예상 퇴근시간이 09:30인 경우)
    const isNightShiftWork = (checkInTime: string | null, checkOutTime: string | null, scheduledCheckIn: string | null = null, scheduledCheckOut: string | null = null) => {
      if (!checkInTime || !checkOutTime) return false
      
      // 예상 출퇴근시간이 있으면 그것을 기준으로, 없으면 실제 출퇴근시간을 기준으로
      const baseCheckIn = scheduledCheckIn || checkInTime
      const baseCheckOut = scheduledCheckOut || checkOutTime
      
      // 30분 단위로 반올림된 시간으로 계산
      const checkInMinutes = getMinutesFromTime(baseCheckIn)
      const checkOutMinutes = getMinutesFromTime(baseCheckOut)
      
      // 09:30 = 570분, 16:30 = 990분
      const nineThirtyMinutes = 570   // 09:30
      const sixteenThirtyMinutes = 990 // 16:30
      
      // 야간 근무 조건: 출근시간이 16:30이고 퇴근시간이 09:30인 경우
      return checkInMinutes === sixteenThirtyMinutes && checkOutMinutes === nineThirtyMinutes
    }
    
    // 시간을 분으로 변환 (반올림 적용)
    const getMinutesFromTime = (timeStr: string) => {
      const roundedTime = roundToNearestHalfHour(timeStr)
      const [hours, minutes] = roundedTime.split(':').map(Number)
      return hours * 60 + minutes
    }
    
    // 휴일 여부 확인 (일요일 + 공휴일, 토요일 제외)
    const isHoliday = (dateString: string) => {
      const date = new Date(dateString)
      const dayOfWeek = date.getDay()
      const isSunday = dayOfWeek === 0 // 일요일만 휴일로 인식
      const isPublicHoliday = holidays.includes(dateString)
      
      return isSunday || isPublicHoliday
    }
    
    // 근무 유형별 시간 계산 함수 제거 (netWorkHours를 직접 사용하므로 불필요)
    
    // 각 직원별로 근무 통계 계산
    const employeeStats = facilityEmployees.map(employee => {
      // 각 직원의 급여 기간에 맞춰 날짜 범위 계산
      const [year, month] = selectedMonth.split('-')
      const payPeriodEndType = Number(employee.pay_period_end_type)
      
      let employeeStartDate: string
      let employeeEndDate: string
      
      if (payPeriodEndType === 10) {
        // 10일 종료: 이번달 11일 ~ 다음달 10일
        if (month === '01') {
          // 1월인 경우 전해 12월 11일부터
          employeeStartDate = `${parseInt(year) - 1}-12-11`
          employeeEndDate = `${year}-01-10`
        } else {
          // 이번달 11일부터 다음달 10일까지
          const prevMonth = String(parseInt(month) - 1).padStart(2, '0')
          const prevYear = month === '01' ? parseInt(year) - 1 : year
          employeeStartDate = `${prevYear}-${prevMonth}-11`
          employeeEndDate = `${year}-${month}-10`
        }
      } else {
        // 20일 종료: 이번달 21일 ~ 다음달 20일
        if (month === '01') {
          // 1월인 경우 전해 12월 21일부터
          employeeStartDate = `${parseInt(year) - 1}-12-21`
          employeeEndDate = `${year}-01-20`
        } else {
          // 이번달 21일부터 다음달 20일까지
          const prevMonth = String(parseInt(month) - 1).padStart(2, '0')
          const prevYear = month === '01' ? parseInt(year) - 1 : year
          employeeStartDate = `${prevYear}-${prevMonth}-21`
          employeeEndDate = `${year}-${month}-20`
        }
      }
      
      const employeeRecords = attendanceRecords.value.filter(record => 
        record.employee_id === employee.id &&
        record.date >= employeeStartDate &&
        record.date <= employeeEndDate
      )
      
      let totalWorkHours = 0
      let holidayWorkHours = 0
      let weekdayWorkHours = 0
      let earlyShiftHours = 0 // 早出 근무시간 추가
      let lateShiftHours = 0  // 遅出 근무시간 추가
      let dayShiftHours = 0
      let totalWorkDays = 0
      let nightShiftCount = 0
      let nightShiftHours = 0 // 야간근무 시간 추가
      
      // 근무 유형별 시간 계산 함수 추가
      const calculateShiftHours = (checkInTime: string | null, checkOutTime: string | null, breakTime: string | null, isHoliday: boolean = false, scheduledCheckIn: string | null = null, scheduledCheckOut: string | null = null) => {
        if (!checkInTime || !checkOutTime) return { early: 0, late: 0, day: 0 }
        
        let adjustedCheckIn = checkInTime
        let adjustedCheckOut = checkOutTime
        
        // 예상 출근시간이 있고, 실제 출근시간이 예상시간과 다르면 조정
        if (scheduledCheckIn) {
          if (checkInTime > scheduledCheckIn) {
            // 실제 출근시간이 늦으면 30분 단위로 올림
            adjustedCheckIn = roundUpToNearestHalfHour(checkInTime)
          } else if (checkInTime < scheduledCheckIn) {
            // 실제 출근시간이 빠르면 예상시간으로 조정
            adjustedCheckIn = scheduledCheckIn
          }
        }
        
        // 예상 퇴근시간이 있고, 실제 퇴근시간이 늦으면 30분 단위로 내림
        if (scheduledCheckOut && checkOutTime > scheduledCheckOut) {
          adjustedCheckOut = roundDownToNearestHalfHour(checkOutTime)
        }
        
        // 30분 단위로 반올림된 시간으로 계산
        const checkInMinutes = getMinutesFromTime(adjustedCheckIn)
        const checkOutMinutes = getMinutesFromTime(adjustedCheckOut)
        
        // 야간근무 여부 확인 (16:30 ~ 다음날 09:30) - 예상 출퇴근시간 기준
        const isNightShift = isNightShiftWork(checkInTime, checkOutTime, scheduledCheckIn, scheduledCheckOut)
        
        // 야간근무인 경우 早出, 遅出, 日勤 계산하지 않음
        if (isNightShift) {
          return { early: 0, late: 0, day: 0 }
        }
        
        // 특별한 회사의 경우 모든 시간을 日勤으로 처리
        if (isSpecialCompany) {
          // 퇴근시간이 출근시간보다 작으면 다음날로 간주 (야간근무)
          let workEndMinutes = checkOutMinutes
          if (workEndMinutes <= checkInMinutes) {
            workEndMinutes += 24 * 60 // 24시간 추가
          }
          
          // 휴식시간 계산 (분 단위)
          const getBreakTimeMinutes = (breakTimeStr: string | null) => {
            if (!breakTimeStr) return 0
            const [hours, minutes] = breakTimeStr.split(':').map(Number)
            return hours * 60 + minutes
          }
          
          const breakTimeMinutes = getBreakTimeMinutes(breakTime)
          
          // 전체 근무시간을 日勤으로 계산
          const totalWorkMinutes = workEndMinutes - checkInMinutes
          let dayShiftMinutes = totalWorkMinutes - breakTimeMinutes
          
          // 휴일에 8시간 이상 근무한 경우 8시간으로 고정
          if (isHoliday && dayShiftMinutes >= 8 * 60) {
            dayShiftMinutes = 8 * 60
          }
          
          return {
            early: 0,
            late: 0,
            day: Math.max(0, dayShiftMinutes / 60)
          }
        }
        
        // 기존 로직 (일반 회사)
        // 퇴근시간이 출근시간보다 작으면 다음날로 간주 (야간근무)
        let workEndMinutes = checkOutMinutes
        if (workEndMinutes <= checkInMinutes) {
          workEndMinutes += 24 * 60 // 24시간 추가
        }
        
        // 휴식시간 계산 (분 단위)
        const getBreakTimeMinutes = (breakTimeStr: string | null) => {
          if (!breakTimeStr) return 0
          const [hours, minutes] = breakTimeStr.split(':').map(Number)
          return hours * 60 + minutes
        }
        
        const breakTimeMinutes = getBreakTimeMinutes(breakTime)
        
        // 근무 유형별 시간 계산
        let earlyShiftMinutes = 0
        let lateShiftMinutes = 0
        let dayShiftMinutes = 0
        
        // 早出: 07:00 ~ 09:00 (420분 ~ 540분)
        const earlyStart = 420
        const earlyEnd = 540
        
        // 遅出: 18:00 ~ 20:00 (1080분 ~ 1200분)
        const lateStart = 1080
        const lateEnd = 1200
        
        // 日勤: 09:00 ~ 18:00 (540분 ~ 1080분)
        const dayStart = 540
        const dayEnd = 1080
        
        // 각 시간대별로 근무시간 계산
        let currentMinute = checkInMinutes
        
        while (currentMinute < workEndMinutes) {
          const minuteInDay = currentMinute % (24 * 60) // 24시간을 넘어가면 다시 0부터
          const nextMinute = Math.min(currentMinute + 30, workEndMinutes)
          const segmentMinutes = nextMinute - currentMinute
          
          // 각 시간대별로 분배
          if (minuteInDay >= lateStart && minuteInDay < lateEnd) {
            lateShiftMinutes += segmentMinutes      // 遅出
          } else if (minuteInDay >= earlyStart && minuteInDay < earlyEnd) {
            earlyShiftMinutes += segmentMinutes     // 早出
          } else if (minuteInDay >= dayStart && minuteInDay < dayEnd) {
            dayShiftMinutes += segmentMinutes       // 日勤
          }
          
          currentMinute = nextMinute
        }
        
        // 휴식시간을 日勤에서만 차감
        if (dayShiftMinutes > 0 && breakTimeMinutes > 0) {
          dayShiftMinutes -= breakTimeMinutes
        }
        
        // 휴일에 야간근무가 아닌 사람이 8시간 이상 근무한 경우 日勤을 조정
        if (isHoliday && !isNightShift) {
          const totalWorkHours = (earlyShiftMinutes + lateShiftMinutes + dayShiftMinutes) / 60
          if (totalWorkHours >= 8) {
            // 早出과 遅出은 그대로 유지하고, 日勤만 조정
            const earlyLateHours = (earlyShiftMinutes + lateShiftMinutes) / 60
            const remainingDayHours = Math.max(0, 8 - earlyLateHours)
            dayShiftMinutes = remainingDayHours * 60
            
            console.log('=== 휴일 8시간 이상 근무 처리 ===')
            console.log('총 근무시간:', totalWorkHours, '시간')
            console.log('早出 + 遅出 시간:', earlyLateHours, '시간')
            console.log('조정된 日勤 시간:', remainingDayHours, '시간')
            console.log('최종 시간:', {
              early: Math.max(0, earlyShiftMinutes / 60),
              late: Math.max(0, lateShiftMinutes / 60),
              day: Math.max(0, dayShiftMinutes / 60)
            })
          }
        }
        
        return {
          early: Math.max(0, earlyShiftMinutes / 60),
          late: Math.max(0, lateShiftMinutes / 60),
          day: Math.max(0, dayShiftMinutes / 60)
        }
      }
      
      employeeRecords.forEach(record => {
        if (record.check_in && record.check_out) {
          const isHolidayWork = isHoliday(record.date)
          
          // 특정 직원 디버깅
          if (employee.id === '2005d812-6ab5-4f95-8ae2-5d6a0a116754') {
            console.log('=== 특정 직원 디버깅 ===')
            console.log('직원 ID:', employee.id)
            console.log('직원명:', `${employee.last_name}${employee.first_name}`)
            console.log('근무일:', record.date)
            console.log('출근시간:', record.check_in)
            console.log('퇴근시간:', record.check_out)
            console.log('예상출근:', record.scheduled_check_in)
            console.log('예상퇴근:', record.scheduled_check_out)
            console.log('휴식시간:', record.break_time)
            console.log('휴일근무여부:', isHolidayWork)
            console.log('특별한회사여부:', isSpecialCompany)
          }
          
          // 야간근무 여부 확인 (16:30 ~ 다음날 09:30) - 예상 출퇴근시간 기준
          const isNightShift = isNightShiftWork(record.check_in, record.check_out, record.scheduled_check_in, record.scheduled_check_out)
          if (isNightShift) {
            nightShiftCount++
            nightShiftHours += 14 // 야간근무는 14시간으로 고정
            
            // 특정 직원 디버깅
            if (employee.id === '2005d812-6ab5-4f95-8ae2-5d6a0a116754') {
              console.log('야간근무로 판정됨')
            }
          }
          
          // 야간근무가 아닌 경우에만 일반 근무시간 계산
          if (!isNightShift) {
            // 실제 출퇴근 시간으로 근무시간 계산
            const actualWorkHours = calculateWorkHours(record.check_in, record.check_out, record.scheduled_check_in, record.scheduled_check_out)
            
            // 휴식시간 계산 (분 단위)
            const getBreakTimeMinutes = (breakTimeStr: string | null) => {
              if (!breakTimeStr) return 0
              const [hours, minutes] = breakTimeStr.split(':').map(Number)
              return hours * 60 + minutes
            }
            
            const breakTimeMinutes = getBreakTimeMinutes(record.break_time)
            const breakTimeHoursForRecord = breakTimeMinutes / 60
            
            // 총 근무시간에서 휴식시간 제외
            const netWorkHours = actualWorkHours - breakTimeHoursForRecord
            totalWorkDays++ // 근무일수 카운트 (출퇴근이 있는 경우만)
            
            // 근무 유형별 시간 계산 - calculateShiftHours 사용
            const shiftHours = calculateShiftHours(record.check_in, record.check_out, record.break_time, isHolidayWork, record.scheduled_check_in, record.scheduled_check_out)
            earlyShiftHours += shiftHours.early
            lateShiftHours += shiftHours.late
            dayShiftHours += shiftHours.day
            
            // 특정 직원 디버깅
            if (employee.id === '2005d812-6ab5-4f95-8ae2-5d6a0a116754') {
              console.log('일반근무 계산:')
              console.log('- 실제근무시간:', actualWorkHours)
              console.log('- 휴식시간(시간):', breakTimeHoursForRecord)
              console.log('- 순근무시간:', netWorkHours)
              console.log('- 근무유형별 시간:', shiftHours)
              console.log('- 누적된 시간:', {
                earlyShiftHours,
                lateShiftHours,
                dayShiftHours
              })
            }
            
            if (isHolidayWork) {
              // 특별한 회사의 경우 휴일출근시간 계산하지 않음
              if (isSpecialCompany) {
                // 휴일출근시간을 계산하지 않고 평일 근무시간에 포함
                weekdayWorkHours += netWorkHours
                
                // 특정 직원 디버깅
                if (employee.id === '2005d812-6ab5-4f95-8ae2-5d6a0a116754') {
                  console.log('특별한회사 휴일근무 - 평일근무시간에 포함:', netWorkHours)
                }
              } else {
                // 일반 회사: 이미 계산된 日勤勤務시간을 휴일출근시간으로 사용
                const dayShiftHoursForHoliday = shiftHours.day
                
                if (dayShiftHoursForHoliday > 0) {
                  holidayWorkHours += dayShiftHoursForHoliday
                  
                  // 특정 직원 디버깅
                  if (employee.id === '2005d812-6ab5-4f95-8ae2-5d6a0a116754') {
                    console.log('일반회사 휴일근무 계산:')
                    console.log('- 출근시간:', record.check_in)
                    console.log('- 퇴근시간:', record.check_out)
                    console.log('- 예상출근:', record.scheduled_check_in)
                    console.log('- 예상퇴근:', record.scheduled_check_out)
                    console.log('- 휴게시간:', record.break_time)
                    console.log('- 日勤勤務時間:', dayShiftHoursForHoliday, '시간')
                    console.log('- 휴일출근시간:', dayShiftHoursForHoliday, '시간')
                  }
                }
              }
            } else {
              // 평일 근무시간 (휴일이 아닌 경우)
              weekdayWorkHours += netWorkHours
              
              // 특정 직원 디버깅
              if (employee.id === '2005d812-6ab5-4f95-8ae2-5d6a0a116754') {
                console.log('평일근무 - 평일근무시간에 포함:', netWorkHours)
              }
            }
            
            // 총 근무시간 누적 (야간근무 제외)
            totalWorkHours += netWorkHours
          } else {
            // 야간근무인 경우 근무일수만 카운트
            totalWorkDays++
          }
        }
      })
      
      // 야간근무 시간을 총 근무시간에 추가
      totalWorkHours += nightShiftHours
      
      // 특정 직원 최종 결과 디버깅
      if (employee.id === '2005d812-6ab5-4f95-8ae2-5d6a0a116754') {
        console.log('=== 특정 직원 최종 결과 ===')
        console.log('총 근무시간:', totalWorkHours)
        console.log('휴일 근무시간:', holidayWorkHours)
        console.log('평일 근무시간:', weekdayWorkHours)
        console.log('일근 시간 (日勤勤務時間):', dayShiftHours)
        console.log('야간근무 횟수:', nightShiftCount)
        console.log('야간근무 시간:', nightShiftHours)
        console.log('총 근무일수:', totalWorkDays)
      }
      
      return {
        employeeId: employee.id,
        employeeCode: employee.employee_code,
        employeeName: `${employee.last_name}${employee.first_name}`,
        facilityName: employee.facility_id ? getFacilityName(employee.facility_id) : '-',
        category: employee.category_1,
        salaryType: employee.salary_type,
        payPeriodEndType: employee.pay_period_end_type,
        payPeriodStartDate: employeeStartDate,
        payPeriodEndDate: employeeEndDate,
        totalWorkHours: Math.round(totalWorkHours * 100) / 100,
        holidayWorkHours: Math.round(holidayWorkHours * 100) / 100,
        weekdayWorkHours: Math.round(weekdayWorkHours * 100) / 100,
        earlyShiftHours: Math.round(earlyShiftHours * 100) / 100, // 早出 근무시간 추가
        lateShiftHours: Math.round(lateShiftHours * 100) / 100,  // 遅出 근무시간 추가
        dayShiftHours: Math.round(dayShiftHours * 100) / 100,
        totalDays: totalWorkDays,
        nightShiftCount,
        nightShiftHours: Math.round(nightShiftHours * 100) / 100, // 야간근무 시간 추가
        facilityId: employee.facility_id || '',
        isSpecialCompany
      }
    })
    
    return {
      facilityId,
      selectedMonth,
      totalEmployees: facilityEmployees.length,
      employeeStats,
      isSpecialCompany
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
      await Promise.all([loadEmployees(), loadCompanies(), loadAttendanceRecords(), loadFacilities(), loadCompanyFacilities()])
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
    companyFacilities,
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
    getFacilitiesByCompany,
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
    getEmployeesByFacility,
    getFacilityEmployeeWorkStats,
  }
})
