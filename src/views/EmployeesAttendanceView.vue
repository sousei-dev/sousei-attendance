<script setup lang="ts">
import { useSupabaseAttendanceStore } from '../stores/supabaseAttendance'
import { useAuthStore } from '../stores/auth'
import { ref, computed, onMounted, watch } from 'vue'
import type { AttendanceRecord } from '../lib/supabase'
import { useRoute } from 'vue-router'

const store = useSupabaseAttendanceStore()
const authStore = useAuthStore()
const route = useRoute()

// 선택된 직원
const selectedEmployeeId = ref('')
const selectedCompanyId = ref('')

// 날짜 선택
const getDefaultStartDate = (employee?: { pay_period_end_type?: string | number }) => {
  const today = new Date()
  const currentMonth = today.getMonth()
  const currentYear = today.getFullYear()
  
  // 선택된 직원의 급여 기간 종료일 확인 (안전하게 처리)
  const payPeriodEndType = employee?.pay_period_end_type ? Number(employee.pay_period_end_type) : 20
  
  let startDate: Date
  
  if (payPeriodEndType === 10) {
    // 현재 11일 이후면 이번달 11일부터
    startDate = new Date(currentYear, currentMonth - 1, 12)
  } else {
    // 현재 21일 이후면 이번달 21일부터
    startDate = new Date(currentYear, currentMonth - 1, 22)
  }
  
  return startDate.toISOString().split('T')[0]
}

const getDefaultEndDate = (employee?: { pay_period_end_type?: string | number }) => {
  const today = new Date()
  const currentMonth = today.getMonth()
  const currentYear = today.getFullYear()
  
  // 선택된 직원의 급여 기간 종료일 확인 (안전하게 처리)
  const payPeriodEndType = employee?.pay_period_end_type ? Number(employee.pay_period_end_type) : 20
  
  let endDate: Date
  
  if (payPeriodEndType === 10) {
    // 10일 종료: 이번달 10일까지
    endDate = new Date(currentYear, currentMonth, 11)
  } else {
    // 20일 종료: 이번달 20일까지
    endDate = new Date(currentYear, currentMonth, 21)
  }
  
  return endDate.toISOString().split('T')[0]
}

const startDate = ref('')
const endDate = ref('')

// 로딩 상태
const loading = ref(false)

// 수정요청 관련 상태
const showChangeRequestModal = ref(false)
const selectedRecordForChange = ref<AttendanceRecord | null>(null)
const changeRequestForm = ref({
  requested_date: '',
  request_type: 'modify', // 'modify', 'cancel', 'register'
  requested_check_in: '',
  requested_check_out: '',
  requested_scheduled_check_in: '',
  requested_scheduled_check_out: '',
  requested_break_time: '',
  reason: ''
})
const submittingRequest = ref(false)

// 등록요청 관련 상태
const showRegistrationRequestModal = ref(false)
const registrationRequestForm = ref({
  requested_date: '',
  requested_check_in: '',
  requested_check_out: '',
  requested_scheduled_check_in: '',
  requested_scheduled_check_out: '',
  requested_break_time: '',
  reason: ''
})
const submittingRegistrationRequest = ref(false)

// 요청 상태 관련 상태
const changeRequests = ref<{
  id: string
  requested_date: string
  attendance_record_id: string | null
  employee_id: string
  request_type: 'register' | 'modify' | 'cancel'
  requested_check_in: string | null
  requested_check_out: string | null
  requested_scheduled_check_in: string | null
  requested_scheduled_check_out: string | null
  requested_break_time: string | null
  reason: string
  status: 'pending' | 'approved' | 'rejected'
  created_at: string
}[]>([])
const loadingRequests = ref(false)

// 엑셀다운로드 관련 상태
const showExcelDownloadModal = ref(false)
const excelDownloadStep = ref(1) // 1: 월선택, 2: 회사선택, 3: 시설선택
const excelDownloadForm = ref({
  selectedMonth: '',
  selectedCompanyId: '',
  selectedFacilityId: ''
})
const downloadingExcel = ref(false)

// 어드민 섹션 토글 상태
const showAdminSection = ref(false)

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

const timeOptions = generateTimeOptions()
const breakTimeOptions = generateBreakTimeOptions()

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
    // auth store 초기화 확인
    if (!authStore.user) {
      await authStore.checkSession()
    }
    
    await store.initialize()
    // 현재 연도의 공휴일 가져오기
    const currentYear = new Date().getFullYear()
    await fetchHolidays(currentYear)
    
    // staff 계정의 company_id 설정은 watch에서 처리
    // 쿼리 파라미터에서 직원 ID 확인
    const employeeIdFromQuery = route.query.employeeId as string
    if (employeeIdFromQuery) {
      selectedEmployeeId.value = employeeIdFromQuery
    }
    
    // 날짜 범위 초기화 (직원이 선택되지 않은 상태에서는 기본값 사용)
    startDate.value = getDefaultStartDate()
    endDate.value = getDefaultEndDate()
  } catch (error) {
    console.error('페이지 초기화 중 에러 발생:', error)
    loading.value = false
  }
})

// store가 초기화된 후 staff 계정의 company_id 설정
watch(() => store.companies, (companies) => {
  if (companies.length > 0 && authStore.isStaff && authStore.user?.company_id && !selectedCompanyId.value) {
    selectedCompanyId.value = authStore.user.company_id
  }
}, { immediate: true })

// auth store의 사용자 정보가 변경될 때도 company_id 설정
watch(() => authStore.user, () => {
  if (store.companies.length > 0 && authStore.isStaff && authStore.user?.company_id && !selectedCompanyId.value) {
    selectedCompanyId.value = authStore.user.company_id
  }
}, { immediate: true })

// 수정요청 관련 함수들
const openChangeRequestModal = (record: AttendanceRecord) => {
  selectedRecordForChange.value = record
  // 폼 초기화 - 시간을 셀렉트 형식으로 변환 (수정/취소 모두 기존 데이터로 초기화)
  changeRequestForm.value = {
    requested_date: record.date || '',
    request_type: 'modify',
    requested_check_in: formatTimeForSelect(record.check_in),
    requested_check_out: formatTimeForSelect(record.check_out),
    requested_scheduled_check_in: formatTimeForSelect(record.scheduled_check_in),
    requested_scheduled_check_out: formatTimeForSelect(record.scheduled_check_out),
    requested_break_time: formatTimeForSelect(record.break_time),
    reason: ''
  }
  showChangeRequestModal.value = true
}

const closeChangeRequestModal = () => {
  showChangeRequestModal.value = false
  selectedRecordForChange.value = null
  changeRequestForm.value = {
    requested_date: '',
    request_type: 'modify',
    requested_check_in: '',
    requested_check_out: '',
    requested_scheduled_check_in: '',
    requested_scheduled_check_out: '',
    requested_break_time: '',
    reason: ''
  }
}

const submitChangeRequest = async () => {
  if (!selectedRecordForChange.value) return
  
  submittingRequest.value = true
  
  try {
    const { supabase } = await import('../lib/supabase')
    
    const { error } = await supabase
      .from('attendance_change_requests')
      .insert({
        requested_date: changeRequestForm.value.requested_date,
        attendance_record_id: selectedRecordForChange.value.id,
        employee_id: selectedRecordForChange.value.employee_id,
        request_type: changeRequestForm.value.request_type,
        requested_check_in: changeRequestForm.value.request_type === 'modify' ? changeRequestForm.value.requested_check_in || null : selectedRecordForChange.value.check_in,
        requested_check_out: changeRequestForm.value.request_type === 'modify' ? changeRequestForm.value.requested_check_out || null : selectedRecordForChange.value.check_out,
        requested_scheduled_check_in: changeRequestForm.value.request_type === 'modify' ? changeRequestForm.value.requested_scheduled_check_in || null : selectedRecordForChange.value.scheduled_check_in,
        requested_scheduled_check_out: changeRequestForm.value.request_type === 'modify' ? changeRequestForm.value.requested_scheduled_check_out || null : selectedRecordForChange.value.scheduled_check_out,
        requested_break_time: changeRequestForm.value.request_type === 'modify' ? changeRequestForm.value.requested_break_time || null : selectedRecordForChange.value.break_time,
        reason: changeRequestForm.value.reason,
        status: 'pending'
      })
    
    if (error) {
      throw error
    }
    
    closeChangeRequestModal()
    
    // 요청 목록 다시 로드
    await loadChangeRequests()
    
    // 성공 메시지 표시 (선택사항)
    alert('修正リクエストが送信されました。管理者の承認をお待ちください。')
    
  } catch (error) {
    console.error('수정요청 제출 중 오류 발생:', error)
    alert('修正リクエストの送信に失敗しました。')
  } finally {
    submittingRequest.value = false
  }
}

// 등록요청 관련 함수들
const openRegistrationRequestModal = () => {
  // 폼 초기화 - 오늘 날짜로 설정
  const today = new Date()
  const todayString = today.toISOString().split('T')[0]
  
  registrationRequestForm.value = {
    requested_date: todayString,
    requested_check_in: '',
    requested_check_out: '',
    requested_scheduled_check_in: '',
    requested_scheduled_check_out: '',
    requested_break_time: '',
    reason: ''
  }
  showRegistrationRequestModal.value = true
}

const closeRegistrationRequestModal = () => {
  showRegistrationRequestModal.value = false
  registrationRequestForm.value = {
    requested_date: '',
    requested_check_in: '',
    requested_check_out: '',
    requested_scheduled_check_in: '',
    requested_scheduled_check_out: '',
    requested_break_time: '',
    reason: ''
  }
}

const submitRegistrationRequest = async () => {
  if (!selectedEmployee.value) return
  
  submittingRegistrationRequest.value = true
  
  try {
    const { supabase } = await import('../lib/supabase')
    
    const { error } = await supabase
      .from('attendance_change_requests')
      .insert({
        requested_date: registrationRequestForm.value.requested_date,
        attendance_record_id: null, // 새로운 기록이므로 null
        employee_id: selectedEmployee.value.id,
        request_type: 'register',
        requested_check_in: registrationRequestForm.value.requested_check_in || null,
        requested_check_out: registrationRequestForm.value.requested_check_out || null,
        requested_scheduled_check_in: registrationRequestForm.value.requested_scheduled_check_in || null,
        requested_scheduled_check_out: registrationRequestForm.value.requested_scheduled_check_out || null,
        requested_break_time: registrationRequestForm.value.requested_break_time || null,
        reason: registrationRequestForm.value.reason,
        status: 'pending'
      })
    
    if (error) {
      throw error
    }

    closeRegistrationRequestModal()
    
    // 요청 목록 다시 로드
    await loadChangeRequests()
    
    // 성공 메시지 표시
    alert('勤務記録登録リクエストが送信されました。管理者の承認をお待ちください。')
    
  } catch (error) {
    console.error('등록요청 제출 중 오류 발생:', error)
    alert('勤務記録登録リクエストの送信に失敗しました。')
  } finally {
    submittingRegistrationRequest.value = false
  }
}

// 출근 기록 로드 함수
const loadAttendanceRecords = async () => {
  if (!selectedEmployee.value || !startDate.value || !endDate.value) return
  
  try {
    await store.loadAttendanceRecords(startDate.value, endDate.value)
  } catch (error) {
    console.error('출근 기록 로드 중 오류 발생:', error)
  }
}

// 요청 상태 관련 함수들
const loadChangeRequests = async () => {
  if (!selectedEmployee.value) return
  
  loadingRequests.value = true
  
  try {
    const { supabase } = await import('../lib/supabase')
    
    const { data, error } = await supabase
      .from('attendance_change_requests')
      .select('*')
      .eq('employee_id', selectedEmployee.value.id)
      .order('created_at', { ascending: false })
    
    if (error) {
      throw error
    }
    
    changeRequests.value = data || []
  } catch (error) {
    console.error('요청 목록 로드 중 오류 발생:', error)
  } finally {
    loadingRequests.value = false
  }
}

// 특정 기록에 대한 요청 상태 확인
const getRequestStatus = (recordId: string | null, date: string) => {
  if (recordId) {
    // 기존 기록 수정/취소 요청
    return changeRequests.value.find(req => 
      req.attendance_record_id === recordId && req.status === 'pending'
    )
  } else {
    // 새로운 기록 등록 요청
    return changeRequests.value.find(req => 
      !req.attendance_record_id && 
      req.status === 'pending' &&
      req.requested_date === date
    )
  }
}

// 요청 상태에 따른 버튼 텍스트
const getRequestButtonText = (record: AttendanceRecord | null, date: string) => {
  const request = getRequestStatus(record?.id || null, date)
  if (request) {
    return '要請中'
  }
  return record ? '修正/取消要請' : '勤務登録要請'
}

// 요청 상태에 따른 버튼 비활성화
const isRequestButtonDisabled = (record: AttendanceRecord | null, date: string) => {
  const request = getRequestStatus(record?.id || null, date)
  return !!request
}

// 요청 상태 텍스트
const getRequestStatusText = (status: string) => {
  switch (status) {
    case 'pending':
      return '承認待ち'
    case 'approved':
      return '承認済み'
    case 'rejected':
      return '却下'
    default:
      return status
  }
}

// 요청 상태 색상
const getRequestStatusColor = (status: string) => {
  switch (status) {
    case 'pending':
      return '#f39c12'
    case 'approved':
      return '#27ae60'
    case 'rejected':
      return '#e74c3c'
    default:
      return '#95a5a6'
  }
}

// 요청 타입 텍스트
const getRequestTypeText = (requestType: string) => {
  switch (requestType) {
    case 'register':
      return '登録要請'
    case 'modify':
      return '修正要請'
    case 'cancel':
      return '取消要請'
    default:
      return requestType
  }
}

// 요청 타입 색상
const getRequestTypeColor = (requestType: string) => {
  switch (requestType) {
    case 'register':
      return '#27ae60' // 초록색
    case 'modify':
      return '#3498db' // 파란색
    case 'cancel':
      return '#e74c3c' // 빨간색
    default:
      return '#95a5a6'
  }
}

// 특정 날짜에 이미 기록이 있는지 확인
const hasExistingRecord = (date: string) => {
  if (!selectedEmployee.value) return false
  
  return store.attendanceRecords.some(record => 
    record.employee_id === selectedEmployee.value?.id && 
    record.date === date
  )
}

// 특정 날짜에 이미 요청이 있는지 확인
const hasExistingRequest = (date: string) => {
  return changeRequests.value.some(request => 
    request.requested_date === date && 
    request.status === 'pending'
  )
}

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

// 직원이 변경될 때 요청 목록 로드
watch(() => selectedEmployee.value, async (newEmployee) => {
  if (newEmployee) {
    await loadChangeRequests()
  } else {
    changeRequests.value = []
  }
})

// 휴일 여부 확인 (주말 + 공휴일)
const isHoliday = (dateString: string) => {
  const date = new Date(dateString)
  const dayOfWeek = date.getDay()
  const isWeekend = dayOfWeek === 0 // 원래 로직: 일요일만 휴일
  const isPublicHoliday = holidays.value.includes(dateString)
  
  // 디버깅 로그 추가
  console.log('=== 휴일 판정 ===')
  console.log('날짜:', dateString)
  console.log('요일:', ['일', '월', '화', '수', '목', '금', '토'][dayOfWeek])
  console.log('요일 숫자:', dayOfWeek)
  console.log('주말 여부:', isWeekend)
  console.log('공휴일 여부:', isPublicHoliday)
  console.log('최종 휴일 여부:', isWeekend || isPublicHoliday)
  
  return isWeekend || isPublicHoliday
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

// 휴식시간을 제외한 근무시간 계산 함수
const calculateNetWorkHours = (checkInTime: string | null, checkOutTime: string | null, breakTime: string | null, isHoliday: boolean = false, scheduledCheckIn: string | null = null, scheduledCheckOut: string | null = null) => {
  if (!checkInTime || !checkOutTime) return 0
  
  // 야간근무 여부 확인 (16:30 ~ 다음날 09:30) - 예상 출퇴근시간 기준
  const isNightShift = isNightShiftWork(checkInTime, checkOutTime, scheduledCheckIn, scheduledCheckOut)
  
  // 야간근무인 경우 14시간으로 고정
  if (isNightShift) {
    return 14
  }
  
  const totalWorkHours = calculateWorkHours(checkInTime, checkOutTime, scheduledCheckIn, scheduledCheckOut)
  
  // 휴식시간 계산 (분 단위)
  const getBreakTimeMinutes = (breakTimeStr: string | null) => {
    if (!breakTimeStr) return 0
    const [hours, minutes] = breakTimeStr.split(':').map(Number)
    return hours * 60 + minutes
  }
  
  const breakTimeMinutes = getBreakTimeMinutes(breakTime)
  const breakTimeHoursForRecord = breakTimeMinutes / 60
  
  
  // 총 근무시간에서 휴식시간 제외
  const netWorkHours = totalWorkHours - breakTimeHoursForRecord
  
  
  // 휴일에 야간근무가 아닌 사람이 8시간 이상 근무한 경우 8시간으로 고정
  if (isHoliday && !isNightShift && netWorkHours >= 8) {
    return 8
  }
  
  const finalHours = Math.max(0, netWorkHours) // 음수가 되지 않도록
  
  return finalHours
}

// 근무 통계 계산
const workStats = computed(() => {
  const records = selectedPeriodRecords.value
  let holidayWorkHours = 0 // 휴일 근무시간
  let holidayExcludedHours = 0 // 휴일 근무시간 제외 시간
  let weekdayWorkHours = 0 // 평일 근무시간
  let earlyShiftHours = 0 // 早出 근무시간
  let lateShiftHours = 0 // 遅出 근무시간
  let dayShiftHours = 0 // 日勤 근무시간
  let totalWorkDays = 0 // 총 근무일수
  let nightShiftCount = 0 // 야근근무 횟수

  // 선택된 회사 ID 확인 - 동적으로 판정
  const selectedCompany = store.companies.find(company => company.id === selectedCompanyId.value)
  const isSpecialCompany = selectedCompany?.is_special_company || false

  records.forEach(record => {
    if (record.check_in && record.check_out) {
      const isHolidayWork = isHoliday(record.date)
      
      // 야근근무 여부 확인 (16:30 ~ 다음날 09:30)
      const isNightShift = isNightShiftWork(record.check_in, record.check_out, record.scheduled_check_in, record.scheduled_check_out)
      if (isNightShift) {
        nightShiftCount++
      }
      
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
      
      if (isHolidayWork) {
        // 특별한 회사의 경우 휴일출근시간 계산하지 않음
        if (isSpecialCompany) {
          // 휴일출근시간을 계산하지 않고 평일 근무시간에 포함
          weekdayWorkHours += netWorkHours
          
          // 디버깅 로그 추가
          console.log('=== 특별한 회사 휴일근무 ===')
          console.log('날짜:', record.date)
          console.log('출근시간:', record.check_in)
          console.log('퇴근시간:', record.check_out)
          console.log('예상출근:', record.scheduled_check_in)
          console.log('예상퇴근:', record.scheduled_check_out)
          console.log('휴식시간:', record.break_time)
          console.log('순근무시간:', netWorkHours)
          console.log('평일근무시간에 포함됨')
          console.log('누적된 평일근무시간:', weekdayWorkHours)
        } else {
          // 기존 로직 (일반 회사)
          // 야간근무가 아닌 경우 09:00~18:00 사이의 근무만 휴일출근시간으로 인정
          if (!record.is_night_shift) {
            
            // calculateShiftHours 함수를 사용해서 정확한 日勤勤務시간 계산
            const shiftHours = calculateShiftHours(record.check_in, record.check_out, record.break_time, isHoliday(record.date), record.scheduled_check_in, record.scheduled_check_out)
            
            // 日勤勤務시간만 휴일출근시간으로 계산
            const dayShiftHoursForHoliday = shiftHours.day
            
            if (dayShiftHoursForHoliday > 0) {
              holidayWorkHours += dayShiftHoursForHoliday
              
              // 제외된 시간 계산 (전체 근무시간 - 인정된 근무시간)
              const excludedHours = netWorkHours - dayShiftHoursForHoliday
              holidayExcludedHours += Math.max(0, excludedHours)
              
              console.log('=== 일반 회사 휴일근무 계산 ===')
              console.log('날짜:', record.date)
              console.log('출근시간:', record.check_in)
              console.log('퇴근시간:', record.check_out)
              console.log('예상출근:', record.scheduled_check_in)
              console.log('예상퇴근:', record.scheduled_check_out)
              console.log('휴게시간:', record.break_time)
              console.log('日勤勤務時間:', dayShiftHoursForHoliday, '시간')
              console.log('휴일출근시간:', dayShiftHoursForHoliday, '시간')
              console.log('- 제외된 시간:', excludedHours, '시간')
              console.log('- 누적된 휴일출근시간:', holidayWorkHours, '시간')
              console.log('- 누적된 제외시간:', holidayExcludedHours, '시간')
            } else {
              // 日勤勤務시간이 없는 경우 모두 제외
              holidayExcludedHours += netWorkHours
              console.log('日勤勤務시간이 없음 - 모두 제외됨')
              console.log('- 제외된 시간:', netWorkHours, '시간')
              console.log('- 누적된 제외시간:', holidayExcludedHours, '시간')
            }
          } else {
            // 야간근무는 휴일 근무로 계산하지 않고 평일 근무시간에 포함
            weekdayWorkHours += netWorkHours
            console.log('야간근무 휴일근무 - 휴일 근무로 계산하지 않음, 평일 근무시간에 포함')
            console.log('- 평일근무시간에 포함:', netWorkHours, '시간')
            console.log('- 누적된 평일근무시간:', weekdayWorkHours, '시간')
          }
        }
      } else {
        // 평일 근무시간 (휴일이 아닌 경우)
        weekdayWorkHours += netWorkHours
        
        console.log('=== 평일근무 ===')
        console.log('날짜:', record.date)
        console.log('순근무시간:', netWorkHours, '시간')
        console.log('누적된 평일근무시간:', weekdayWorkHours, '시간')
      }
      
      // 근무 유형별 시간 계산
      const shiftHours = calculateShiftHours(record.check_in, record.check_out, record.break_time, isHoliday(record.date), record.scheduled_check_in, record.scheduled_check_out)
      earlyShiftHours += shiftHours.early
      lateShiftHours += shiftHours.late
      dayShiftHours += shiftHours.day
    }
  })

  // 총 근무시간을 분류된 시간들의 합계로 계산
  const nightShiftHours = nightShiftCount * 14 // 야간근무시간 (1회당 14시간)
  const totalWorkHours = earlyShiftHours + lateShiftHours + dayShiftHours + nightShiftHours

  return {
    totalWorkHours: Math.round(totalWorkHours * 100) / 100,
    holidayWorkHours: Math.round(holidayWorkHours * 100) / 100,
    holidayExcludedHours: Math.round(holidayExcludedHours * 100) / 100,
    weekdayWorkHours: Math.round(weekdayWorkHours * 100) / 100,
    earlyShiftHours: Math.round(earlyShiftHours * 100) / 100,
    lateShiftHours: Math.round(lateShiftHours * 100) / 100,
    dayShiftHours: Math.round(dayShiftHours * 100) / 100,
    totalDays: totalWorkDays,
    nightShiftCount, // 야근근무 횟수 추가
    isSpecialCompany // 특별한 회사 여부 추가
  }
})

// 근무 유형별 시간 계산 함수
const calculateShiftHours = (checkInTime: string | null, checkOutTime: string | null, breakTime: string | null, isHoliday: boolean = false, scheduledCheckIn: string | null = null, scheduledCheckOut: string | null = null) => {
  if (!checkInTime || !checkOutTime) return { early: 0, late: 0, day: 0 }
  
  // 선택된 회사 ID 확인 - 동적으로 판정
  const selectedCompany = store.companies.find(company => company.id === selectedCompanyId.value)
  const isSpecialCompany = selectedCompany?.is_special_company || false

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

// 야근근무 여부 확인 (예상 출근시간이 16:30이고 예상 퇴근시간이 09:30인 경우)
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
  
  // 원본 시간값을 그대로 표시 (30분 반올림 제거)
  return timeString
}

const formatDateTime = (dateTimeString: string) => {
  if (!dateTimeString) return '-'
  const date = new Date(dateTimeString)
  return date.toLocaleString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
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
  
  // 30분 단위로 반올림된 시간으로 계산
  const roundedExpectedTime = roundToNearestHalfHour(expectedTime)
  const roundedActualTime = roundToNearestHalfHour(actualTime)
  
  const expected = new Date(`2000-01-01T${roundedExpectedTime}`)
  const actual = new Date(`2000-01-01T${roundedActualTime}`)
  
  return Math.abs(actual.getTime() - expected.getTime()) / (1000 * 60)
}

// 시간 차이를 텍스트로 표시
const getTimeDifferenceText = (expectedTime: string | null, actualTime: string | null) => {
  if (!expectedTime || !actualTime) return ''
  
  const diff = getTimeDifference(expectedTime, actualTime)
  if (diff < 30) return ''
  
  // 예상 시간보다 빨리 출근한 경우 차이 텍스트를 표시하지 않음
  const expected = new Date(`2000-01-01T${expectedTime}`)
  const actual = new Date(`2000-01-01T${actualTime}`)
  if (actual.getTime() < expected.getTime()) return ''
  
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

// 출근 시간 차이 확인 (30분 이상 늦게 출근한 경우에만 true)
const isCheckInTimeDifferent = (record: AttendanceRecord) => {
  if (!record.scheduled_check_in || !record.check_in) return false
  
  const diff = getTimeDifference(record.scheduled_check_in, record.check_in)
  if (diff < 30) return false
  
  // 예상 시간보다 빨리 출근한 경우 false 반환
  const expected = new Date(`2000-01-01T${record.scheduled_check_in}`)
  const actual = new Date(`2000-01-01T${record.check_in}`)
  if (actual.getTime() < expected.getTime()) return false
  
  return true
}

// 퇴근 시간 차이 확인 (30분 이상 차이나면 true)
const isCheckOutTimeDifferent = (record: AttendanceRecord) => {
  const diff = getTimeDifference(record.scheduled_check_out, record.check_out)
  return diff >= 30
}

// 선택된 직원 ID가 변경될 때마다 날짜 범위를 업데이트
watch(selectedEmployeeId, () => {
  startDate.value = getDefaultStartDate(selectedEmployee.value)
  endDate.value = getDefaultEndDate(selectedEmployee.value)
})

// startDate가 변경될 때 endDate 유효성 검사 및 자동 검색
watch(startDate, (newStartDate) => {
  if (newStartDate && endDate.value && newStartDate > endDate.value) {
    endDate.value = newStartDate
  }
  // 날짜가 변경되면 자동으로 검색 실행
  if (selectedEmployee.value) {
    loadAttendanceRecords()
  }
})

// endDate가 변경될 때 유효성 검사 및 자동 검색
watch(endDate, (newEndDate) => {
  if (newEndDate && startDate.value && newEndDate < startDate.value) {
    endDate.value = startDate.value
  }
  // 날짜가 변경되면 자동으로 검색 실행
  if (selectedEmployee.value) {
    loadAttendanceRecords()
  }
})

// 회사 선택이 변경될 때 직원 선택 초기화
watch(selectedCompanyId, () => {
  selectedEmployeeId.value = ''
  startDate.value = getDefaultStartDate()
  endDate.value = getDefaultEndDate()
})

// 엑셀다운로드 모달 관련 함수들
const openExcelDownloadModal = () => {
  // 현재 날짜 기준으로 기본 월 설정
  const currentDate = new Date()
  const currentMonth = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`
  
  excelDownloadForm.value = {
    selectedMonth: currentMonth,
    selectedCompanyId: '',
    selectedFacilityId: ''
  }
  
  excelDownloadStep.value = 1
  showExcelDownloadModal.value = true
}

const closeExcelDownloadModal = () => {
  showExcelDownloadModal.value = false
  excelDownloadStep.value = 1
  excelDownloadForm.value = {
    selectedMonth: '',
    selectedCompanyId: '',
    selectedFacilityId: ''
  }
}

const nextStep = () => {
  if (excelDownloadStep.value < 3) {
    excelDownloadStep.value++
  }
}

const prevStep = () => {
  if (excelDownloadStep.value > 1) {
    excelDownloadStep.value--
  }
}

const canProceedToNext = computed(() => {
  switch (excelDownloadStep.value) {
    case 1:
      return !!excelDownloadForm.value.selectedMonth
    case 2:
      return !!excelDownloadForm.value.selectedCompanyId
    case 3:
      return !!excelDownloadForm.value.selectedFacilityId
    default:
      return false
  }
})

// 선택된 회사의 시설 목록
const availableFacilities = computed(() => {
  if (!excelDownloadForm.value.selectedCompanyId) return []
  
  return store.getFacilitiesByCompany(excelDownloadForm.value.selectedCompanyId)
})

// 엑셀다운로드에서 회사 선택이 변경될 때 시설 선택 초기화
watch(() => excelDownloadForm.value.selectedCompanyId, () => {
  excelDownloadForm.value.selectedFacilityId = ''
})



// 엑셀 다운로드 함수
const downloadExcel = async () => {
  if (!excelDownloadForm.value.selectedFacilityId || !excelDownloadForm.value.selectedMonth) return
  
  downloadingExcel.value = true
  
  try {
    // CSV 파일명 생성을 위한 년월 정보
    const [year, month] = excelDownloadForm.value.selectedMonth.split('-')
    
    // 시설별 근무 통계 가져오기
    const facilityStats = await store.getFacilityEmployeeWorkStats(
      excelDownloadForm.value.selectedFacilityId,
      excelDownloadForm.value.selectedMonth
    )
    
    if (!facilityStats) {
      throw new Error('근무 통계를 가져올 수 없습니다.')
    }
    
    // 시설 정보 가져오기
    const selectedFacility = store.facilities.find(f => f.id === excelDownloadForm.value.selectedFacilityId)
    const selectedCompany = store.companies.find(c => c.id === excelDownloadForm.value.selectedCompanyId)
    
    // CSV 데이터 생성
    console.log('Selected Company:', selectedCompany)
    console.log('Company is_special_company:', selectedCompany?.is_special_company)
    console.log('Company object keys:', selectedCompany ? Object.keys(selectedCompany) : 'No company')
    console.log('Company full object:', JSON.stringify(selectedCompany, null, 2))
    console.log('All companies:', store.companies)
    console.log('All companies with is_special_company:', store.companies.map(c => ({ id: c.id, name: c.name, is_special_company: c.is_special_company })))
    
    const csvData = generateCSVData(facilityStats, selectedFacility, selectedCompany)
    
    // 파일 다운로드
    downloadCSVFile(csvData, `${selectedCompany?.name}_${selectedFacility?.name}_${year}年${month}月_勤務記録.csv`)
    
    // 성공 메시지
    alert('エクセルファイルが正常にダウンロードされました。')
    closeExcelDownloadModal()
    
  } catch (error) {
    console.error('エクセルダウンロード中にエラーが発生しました:', error)
    alert('エクセルダウンロードに失敗しました。')
  } finally {
    downloadingExcel.value = false
  }
}

// CSV 데이터 생성 함수
const generateCSVData = (stats: Awaited<ReturnType<typeof store.getFacilityEmployeeWorkStats>>, facility: { id: string; name: string } | undefined, company: { id: string; name: string; is_special_company?: boolean } | undefined) => {
  if (!stats) return []
  
  const headers = company?.is_special_company
    ? [
        '従業員番号',
        '従業員名',
        '施設名',
        '職種',
        '給与形態',
        '給与期間終了日',
        '給与期間開始日',
        '給与期間終了日',
        '総勤務日数',
        '総勤務時間',
        '日勤勤務時間',
        '夜勤勤務回数',
        '夜勤勤務時間'
      ]
    : [
        '従業員番号',
        '従業員名',
        '施設名',
        '職種',
        '給与形態',
        '給与期間終了日',
        '給与期間開始日',
        '給与期間終了日',
        '総勤務日数',
        '総勤務時間',
        '早出勤務時間',
        '遅出勤務時間',
        '日勤勤務時間',
        '休日出勤時間',
        '休日出勤+30円計算',
        '夜勤勤務回数',
        '夜勤勤務時間'
      ]
  
  const rows = stats.employeeStats.map(employee => {
    // 각 직원의 급여 기간에 맞춰 날짜 범위 계산
    const [year, month] = excelDownloadForm.value.selectedMonth.split('-')
    const payPeriodEndType = Number(employee.payPeriodEndType)
    
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
        employeeEndDate = `${year}-${month}-20`
      } else {
        // 이번달 21일부터 다음달 20일까지
        const prevMonth = String(parseInt(month) - 1).padStart(2, '0')
        const prevYear = month === '01' ? parseInt(year) - 1 : year
        employeeStartDate = `${prevYear}-${prevMonth}-21`
        employeeEndDate = `${year}-${month}-20`
      }
    }
    
    if (company?.is_special_company) {
      // 특별한 회사일 때 간소화된 데이터
      console.log('=== 특별한 회사 직원 데이터 디버깅 ===')
      console.log('직원:', employee.employeeName)
      console.log('dayShiftHours:', employee.dayShiftHours)
      console.log('totalWorkHours:', employee.totalWorkHours)
      console.log('nightShiftHours:', employee.nightShiftHours)
      console.log('nightShiftCount:', employee.nightShiftCount)
      
      return [
        employee.employeeCode,
        employee.employeeName,
        employee.facilityName,
        employee.category,
        employee.salaryType === 'monthly' ? '日給月給制(正社員)' : employee.salaryType === 'hourly' ? '時給制(パート)' : '-',
        `${employee.payPeriodEndType}日`,
        employeeStartDate,
        employeeEndDate,
        String(employee.totalDays),           // 総勤務日数
        String(employee.totalWorkHours),      // 総勤務時間
        String(employee.dayShiftHours),       // 日勤勤務時間 (dayShiftHours 사용)
        String(employee.nightShiftCount),    // 夜勤勤務回数
        String(employee.nightShiftHours)     // 夜勤勤務時間
      ]
    } else {
      // 일반 회사일 때 기존 데이터
      return [
        employee.employeeCode,
        employee.employeeName,
        employee.facilityName,
        employee.category,
        employee.salaryType === 'monthly' ? '日給月給制(正社員)' : employee.salaryType === 'hourly' ? '時給制(パート)' : '-',
        `${employee.payPeriodEndType}日`,
        employeeStartDate,
        employeeEndDate,
        String(employee.totalDays),
        String(employee.totalWorkHours),
        String(employee.earlyShiftHours),
        String(employee.lateShiftHours),
        String(employee.dayShiftHours),
        String(employee.holidayWorkHours),
        String(employee.holidayWorkHours * 30), // 休日出勤+30円計算
        String(employee.nightShiftCount),
        String(employee.nightShiftHours)
      ]
    }
  })
  
  // 요약 정보를 맨 위에 추가
  const summaryRows = [
    ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
    ['=== サマリー情報 ===', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
    ['会社名', company?.name || '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
    ['施設名', facility?.name || '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
    ['選択月', excelDownloadForm.value.selectedMonth, '', '', '', '', '', '', '', '', '', '', '', '', ''],
    ['総従業員数', String(stats.totalEmployees), '名', '', '', '', '', '', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
    ['=== 従業員別詳細情報 ===', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '']
  ]
  
  return [headers, ...summaryRows, ...rows]
}

// CSV 파일 다운로드 함수
const downloadCSVFile = (csvData: string[][], filename: string) => {
  const csvContent = csvData.map(row => 
    row.map(cell => `"${cell}"`).join(',')
  ).join('\n')
  
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  
  if (link.download !== undefined) {
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    link.setAttribute('download', filename)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }
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
    
    <!-- 어드민 섹션 -->
    <div v-if="authStore.isAdmin" class="admin-section">
      <div class="admin-section-header">
        <span class="admin-icon">👑</span>
        <h3>管理者機能</h3>
        <button 
          @click="showAdminSection = !showAdminSection"
          class="admin-toggle-btn"
          :class="{ 'expanded': showAdminSection }"
        >
          <span class="arrow-icon">{{ showAdminSection ? '▶' : '▼' }}</span>
        </button>
      </div>
      
      <!-- 어드민 섹션 내용 (토글 가능) -->
      <div v-show="showAdminSection" class="admin-section-content">
        <!-- 엑셀다운로드 버튼 -->
        <div class="excel-download-section">
          <button 
            @click="openExcelDownloadModal"
            class="excel-download-btn"
          >
            📊 エクセルダウンロード
          </button>
          <p class="excel-download-description">
            選択した施設の全従業員勤務統計をエクセルファイルでダウンロードできます。
          </p>
        </div>
      </div>
    </div>
    
    <!-- 직원 선택 및 기간 설정 -->
    <div class="control-section">
      <div class="company-selector">
        <label for="company-select">会社選択:</label>
        <select 
          id="company-select" 
          v-model="selectedCompanyId"
          class="company-select"
          :disabled="authStore.isStaff && !!authStore.user?.company_id"
        >
          <option value="">会社を選択してください</option>
          <option 
            v-for="company in store.companies" 
            :key="company.id" 
            :value="company.id"
          >
            {{ company.name }}
          </option>
        </select>
        <div v-if="store.loading" class="loading-notice">
          <small>회사 목록을 불러오는 중...</small>
        </div>
      </div>

      <div class="employee-selector">
        <label for="employee-select">従業員選択:</label>
        <select 
          id="employee-select" 
          v-model="selectedEmployeeId"
          class="employee-select"
          :disabled="!selectedCompanyId || store.loading"
        >
          <option value="">従業員を選択してください</option>
          <option 
            v-for="employee in authStore.isAdmin ? store.getEmployeeByCompanyId(selectedCompanyId) : store.activeEmployees" 
            :key="employee.id" 
            :value="employee.id"
          >
            {{ employee.employee_code }} - {{ employee.last_name }}{{ employee.first_name }} ({{ employee.facility_id ? store.getFacilityName(employee.facility_id) : '-' }})
          </option>
        </select>
        <div v-if="store.loading" class="loading-notice">
          <small>직원 목록을 불러오는 중...</small>
        </div>
      </div>

      <div class="date-range-selector">
        <div class="date-input">
          <label for="start-date">開始日:</label>
          <input 
            id="start-date" 
            type="date" 
            v-model="startDate"
            class="date-input-field"
            :class="{ 'error': startDate && endDate && startDate > endDate }"
          />
        </div>
        <div class="date-input">
          <label for="end-date">終了日:</label>
          <input 
            id="end-date" 
            type="date" 
            v-model="endDate"
            class="date-input-field"
            :class="{ 'error': startDate && endDate && endDate < startDate }"
          />
          <div v-if="startDate && endDate && endDate < startDate" class="error-message">
            終了日は開始日以降の日付を選択してください。
          </div>
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
          <span class="value">{{ selectedEmployee.facility_id ? store.getFacilityName(selectedEmployee.facility_id) : '-' }}</span>
        </div>
        <div class="detail-item">
          <span class="label">職種:</span>
          <span class="value">{{ selectedEmployee.category_1 }}</span>
        </div>
        <div class="detail-item">
          <span class="label">給与形態:</span>
          <span class="value">
            {{ selectedEmployee.salary_type === 'monthly' ? '日給月給制(正社員)' : selectedEmployee.salary_type === 'hourly' ? '時間給制(パート)' : '-' }}
          </span>
        </div>
        <div class="detail-item">
          <span class="label">締切日:</span>
          <span class="value">
            {{ selectedEmployee.pay_period_end_type }} 日
          </span>
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
      </div>
      
      <!-- 근무 유형별 통계 -->
      <div class="shift-stats" v-if="!workStats.isSpecialCompany">
        <h3>勤務区分別統計</h3>
        <div class="stats-grid">
          <div class="stat-card shift-card">
            <div class="stat-icon">🌅</div>
            <div class="stat-content">
              <div class="stat-number">{{ workStats.earlyShiftHours }}時間</div>
              <div class="stat-label">早出勤務時間</div>
              <div class="stat-subtitle">07:00～09:00</div>
            </div>
          </div>
          <div class="stat-card shift-card">
            <div class="stat-icon">🌆</div>
            <div class="stat-content">
              <div class="stat-number">{{ workStats.lateShiftHours }}時間</div>
              <div class="stat-label">遅出勤務時間</div>
              <div class="stat-subtitle">18:00～20:00</div>
            </div>
          </div>
          <div class="stat-card shift-card">
            <div class="stat-icon">☀️</div>
            <div class="stat-content">
              <div class="stat-number">{{ workStats.dayShiftHours }}時間</div>
              <div class="stat-label">日勤勤務時間</div>
              <div class="stat-subtitle">その他時間</div>
            </div>
          </div>
          <div class="stat-card">
          <div class="stat-icon">🌅</div>
          <div class="stat-content">
            <div class="stat-number">{{ workStats.holidayWorkHours }}時間</div>
            <div class="stat-label">休日出勤時間</div>
            <div class="stat-subtitle">+30円計算：<span class="red-font">{{ workStats.holidayWorkHours * 30 }}円</span></div>
          </div>
        </div>
          <div class="stat-card shift-card">
            <div class="stat-icon">🌙</div>
            <div class="stat-content">
              <div class="stat-number">{{ workStats.nightShiftCount }} / {{ workStats.nightShiftCount * 14 }}時間</div>
              <div class="stat-label">夜勤勤務回数 / 時間</div>
              <div class="stat-subtitle">16:30～翌日09:30</div>
            </div>
          </div>
        </div>
      </div>

      <!-- 특별한 회사의 경우 간단한 통계 -->
      <div class="shift-stats" v-if="workStats.isSpecialCompany">
        <h3>勤務区分別統計</h3>
        <div class="stats-grid">
          <div class="stat-card shift-card">
            <div class="stat-icon">☀️</div>
            <div class="stat-content">
              <div class="stat-number">{{ workStats.dayShiftHours }}時間</div>
              <div class="stat-label">日勤勤務時間</div>
              <div class="stat-subtitle">全勤務時間</div>
            </div>
          </div>
          <div class="stat-card shift-card">
            <div class="stat-icon">🌙</div>
            <div class="stat-content">
              <div class="stat-number">{{ workStats.nightShiftCount }} / {{ workStats.nightShiftCount * 14 }}時間</div>
              <div class="stat-label">夜勤勤務回数 / 時間</div>
              <div class="stat-subtitle">16:30～翌日09:30</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 상세 근무 기록 -->
    <div v-if="selectedEmployee" class="work-records">
      <div class="work-records-header">
        <h2>詳細勤務記録</h2>
        <button 
          @click="openRegistrationRequestModal"
          class="registration-request-btn"
          :title="isRequestButtonDisabled(null, new Date().toISOString().split('T')[0]) || hasExistingRecord(new Date().toISOString().split('T')[0]) ? '이미 등록된 날짜입니다' : '勤務記録登録リクエストを送信'"
        >
          ➕ 勤務登録要請
        </button>
      </div>
      <div v-if="selectedPeriodRecords.length === 0" class="no-records">
        選択された期間の勤務記録がありません。
      </div>
      <div v-else class="records-table">
        <table>
          <thead>
            <tr>
              <th>日付</th>
              <th>予想出勤</th>
              <th>予想退勤</th>
              <th>休憩時間</th>
              <th>出勤時間</th>
              <th>退勤時間</th>
              <th v-if="!workStats.isSpecialCompany">早出</th>
              <th v-if="!workStats.isSpecialCompany">遅出</th>
              <th>日勤</th>
              <th>勤務時間</th>
              <th>状態</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="record in selectedPeriodRecords" :key="record.id"
                :class="{ timeDifference: isCheckInTimeDifferent(record) || isCheckOutTimeDifferent(record) }">
              <td>{{ formatDate(record.date) }}</td>
              <td>{{ formatTime(record.scheduled_check_in) }}</td>
              <td>{{ formatTime(record.scheduled_check_out) }}</td>
              <td>{{ formatTime(record.break_time) }}</td>
              <td>
                <span :class="{ 'time-display': !getCheckInDifferenceText(record), 'time-difference': getCheckInDifferenceText(record) }">
                  {{ formatTime(record.check_in) }}
                </span>
              </td>
              <td>
                <span :class="{ 'time-display': !getCheckOutDifferenceText(record), 'time-difference': getCheckOutDifferenceText(record) }">
                  {{ formatTime(record.check_out) }}
                </span>
              </td>
              <td v-if="!workStats.isSpecialCompany">
                {{ (() => { const hours = calculateShiftHours(record.check_in, record.check_out, record.break_time, isHoliday(record.date), record.scheduled_check_in, record.scheduled_check_out); return hours.early > 0 ? `${hours.early.toFixed(1)}時間` : '-'; })() }}
              </td>
              <td v-if="!workStats.isSpecialCompany">
                {{ (() => { const hours = calculateShiftHours(record.check_in, record.check_out, record.break_time, isHoliday(record.date), record.scheduled_check_in, record.scheduled_check_out); return hours.late > 0 ? `${hours.late.toFixed(1)}時間` : '-'; })() }}
              </td>
              <td>
                {{ (() => { const hours = calculateShiftHours(record.check_in, record.check_out, record.break_time, isHoliday(record.date), record.scheduled_check_in, record.scheduled_check_out); return hours.day > 0 ? `${hours.day.toFixed(1)}時間` : '-'; })() }}
              </td>
              <td>
                {{ record.check_in && record.check_out ? `${calculateNetWorkHours(record.check_in, record.check_out, record.break_time, isHoliday(record.date), record.scheduled_check_in, record.scheduled_check_out).toFixed(1)}時間` : '-' }}
              </td>
              <td>
                <span class="status-badge" :style="{ backgroundColor: getWorkStatusColor(record) }">
                  {{ getWorkStatusText(record) }}
                </span>
              </td>
              <td>
                <button 
                  @click="openChangeRequestModal(record)"
                  class="change-request-btn"
                  :class="{ 'disabled': isRequestButtonDisabled(record, record.date) }"
                  :disabled="isRequestButtonDisabled(record, record.date)"
                  :title="isRequestButtonDisabled(record, record.date) ? '요청 처리중' : '修正リクエストを送信'"
                >
                  {{ getRequestButtonText(record, record.date) }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- 요청보낸 리스트 -->
    <div v-if="selectedEmployee && changeRequests.length > 0" class="requests-section">
      <h3>送信済みリクエスト</h3>
      <div class="records-table">
        <table>
          <thead>
            <tr>
              <th>日付</th>
              <th>タイプ</th>
              <th>出勤時間</th>
              <th>退勤時間</th>
              <th>予想出勤</th>
              <th>予想退勤</th>
              <th>休憩時間</th>
              <th>理由</th>
              <th>状態</th>
              <th>送信日時</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="request in changeRequests" :key="request.id">
              <td>{{ formatDate(request.requested_date) }}</td>
                              <td>
                  <span class="request-type-badge" :style="{ backgroundColor: getRequestTypeColor(request.request_type) }">
                    {{ getRequestTypeText(request.request_type) }}
                  </span>
                </td>
              <td>{{ formatTime(request.requested_check_in) }}</td>
              <td>{{ formatTime(request.requested_check_out) }}</td>
              <td>{{ formatTime(request.requested_scheduled_check_in) }}</td>
              <td>{{ formatTime(request.requested_scheduled_check_out) }}</td>
              <td>{{ formatTime(request.requested_break_time) }}</td>
              <td class="reason-cell">
                <div class="reason-text" :title="request.reason">
                  {{ request.reason }}
                </div>
              </td>
              <td>
                <span class="status-badge" :style="{ backgroundColor: getRequestStatusColor(request.status) }">
                  {{ getRequestStatusText(request.status) }}
                </span>
              </td>
              <td>{{ formatDateTime(request.created_at) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- 수정요청 모달 -->
    <div v-if="showChangeRequestModal" class="modal-overlay" @click="closeChangeRequestModal">
      <div class="modal-content" @click.stop>
        <div class="modal-header">
          <h3>勤務記録修正リクエスト</h3>
          <button @click="closeChangeRequestModal" class="close-btn">×</button>
        </div>
        
        <div class="modal-body">
          <div class="record-info">
            <p><strong>対象日:</strong> {{ selectedRecordForChange ? formatDate(selectedRecordForChange.date) : '' }}</p>
            <p><strong>従業員:</strong> {{ selectedEmployee?.last_name }}{{ selectedEmployee?.first_name }}</p>
          </div>
          
          <form @submit.prevent="submitChangeRequest" class="change-request-form">
            <div class="form-group">
              <label>リクエストタイプ <span class="required">*</span></label>
              <select 
                v-model="changeRequestForm.request_type"
                class="form-input"
                required
              >
                <option value="modify">修正要請</option>
                <option value="cancel">取消要請</option>
              </select>
            </div>
            
                        <div class="time-inputs">
              <div class="form-group">
                <label>出勤時間</label>
                <input 
                  type="time" 
                  v-model="changeRequestForm.requested_check_in"
                  class="form-input"
                  :disabled="changeRequestForm.request_type === 'cancel'"
                  step="1"
                >
              </div>
              
              <div class="form-group">
                <label>退勤時間</label>
                <input 
                  type="time" 
                  v-model="changeRequestForm.requested_check_out"
                  class="form-input"
                  :disabled="changeRequestForm.request_type === 'cancel'"
                  step="1"
                >
              </div>
              
              <div class="form-group">
                <label>予想出勤時間</label>
                <select 
                  v-model="changeRequestForm.requested_scheduled_check_in"
                  class="form-input time-select"
                  :disabled="changeRequestForm.request_type === 'cancel'"
                >
                  <option v-for="time in timeOptions" :key="time" :value="time">{{ time }}</option>
                </select>
              </div>
              
              <div class="form-group">
                <label>予想退勤時間</label>
                <select 
                  v-model="changeRequestForm.requested_scheduled_check_out"
                  class="form-input time-select"
                  :disabled="changeRequestForm.request_type === 'cancel'"
                >
                  <option v-for="time in timeOptions" :key="time" :value="time">{{ time }}</option>
                </select>
              </div>
              
              <div class="form-group">
                <label>休憩時間</label>
                <select 
                  v-model="changeRequestForm.requested_break_time"
                  class="form-input time-select"
                  :disabled="changeRequestForm.request_type === 'cancel'"
                >
                  <option v-for="time in breakTimeOptions" :key="time" :value="time">{{ time }}</option>
                </select>
              </div>
            </div>
            

            
            <div class="form-group">
              <label>{{ changeRequestForm.request_type === 'modify' ? '修正理由' : changeRequestForm.request_type === 'cancel' ? '取消理由' : '登録理由' }} <span class="required">*</span></label>
              <textarea 
                v-model="changeRequestForm.reason"
                class="form-textarea"
                :placeholder="changeRequestForm.request_type === 'modify' ? '修正理由を入力してください' : changeRequestForm.request_type === 'cancel' ? '取消理由を入力してください' : '登録理由を入力してください'"
                required
              ></textarea>
            </div>
            
            <div class="form-actions">
              <button 
                type="button" 
                @click="closeChangeRequestModal"
                class="btn-secondary"
              >
                キャンセル
              </button>
              <button 
                type="submit" 
                :disabled="submittingRequest || !changeRequestForm.reason"
                class="btn-primary"
              >
                {{ submittingRequest ? '送信中...' : 'リクエスト送信' }}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>

    <!-- 등록요청 모달 -->
    <div v-if="showRegistrationRequestModal" class="modal-overlay" @click="closeRegistrationRequestModal">
      <div class="modal-content" @click.stop>
        <div class="modal-header">
          <h3>勤務記録登録リクエスト</h3>
          <button @click="closeRegistrationRequestModal" class="close-btn">×</button>
        </div>
        
        <div class="modal-body">
          <div class="record-info">
            <p><strong>従業員:</strong> {{ selectedEmployee?.last_name }}{{ selectedEmployee?.first_name }}</p>
          </div>
          
          <form @submit.prevent="submitRegistrationRequest" class="change-request-form">
            <div class="form-group">
              <label>対象日 <span class="required">*</span></label>
              <input 
                type="date" 
                v-model="registrationRequestForm.requested_date"
                class="form-input"
                :class="{ 'error': hasExistingRecord(registrationRequestForm.requested_date) || hasExistingRequest(registrationRequestForm.requested_date) }"
                required
              >
              <div v-if="hasExistingRecord(registrationRequestForm.requested_date)" class="error-message">
                この日付には既に勤務記録が存在します。
              </div>
              <div v-if="hasExistingRequest(registrationRequestForm.requested_date)" class="error-message">
                この日付には既にリクエストが送信されています。
              </div>
            </div>
            
            <div class="form-group">
              <label>出勤時間</label>
              <input 
                type="time" 
                v-model="registrationRequestForm.requested_check_in"
                class="form-input"
                step="1"
              >
            </div>
            
            <div class="form-group">
              <label>退勤時間</label>
              <input 
                type="time" 
                v-model="registrationRequestForm.requested_check_out"
                class="form-input"
                step="1"
              >
            </div>
            
            <div class="form-group">
              <label>予想出勤時間</label>
              <select 
                v-model="registrationRequestForm.requested_scheduled_check_in"
                class="form-input time-select"
              >
                <option v-for="time in timeOptions" :key="time" :value="time">{{ time }}</option>
              </select>
            </div>
            
            <div class="form-group">
              <label>予想退勤時間</label>
              <select 
                v-model="registrationRequestForm.requested_scheduled_check_out"
                class="form-input time-select"
              >
                <option v-for="time in timeOptions" :key="time" :value="time">{{ time }}</option>
              </select>
            </div>
            
            <div class="form-group">
              <label>休憩時間</label>
              <select 
                v-model="registrationRequestForm.requested_break_time"
                class="form-input time-select"
              >
                <option v-for="time in breakTimeOptions" :key="time" :value="time">{{ time }}</option>
              </select>
            </div>
            
            <div class="form-group">
              <label>登録理由 <span class="required">*</span></label>
              <textarea 
                v-model="registrationRequestForm.reason"
                class="form-textarea"
                placeholder="登録理由を入力してください"
                required
              ></textarea>
            </div>
            
            <div class="form-actions">
              <button 
                type="button" 
                @click="closeRegistrationRequestModal"
                class="btn-secondary"
              >
                キャンセル
              </button>
              <button 
                type="submit" 
                :disabled="submittingRegistrationRequest || !registrationRequestForm.reason || !registrationRequestForm.requested_date || hasExistingRecord(registrationRequestForm.requested_date) || hasExistingRequest(registrationRequestForm.requested_date)"
                class="btn-primary"
              >
                {{ submittingRegistrationRequest ? '送信中...' : 'リクエスト送信' }}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>

    <!-- 엑셀다운로드 모달 -->
    <div v-if="showExcelDownloadModal" class="modal-overlay" @click="closeExcelDownloadModal">
      <div class="modal-content excel-download-modal" @click.stop>
        <div class="modal-header">
          <h3>エクセルダウンロード</h3>
          <button @click="closeExcelDownloadModal" class="close-btn">×</button>
        </div>
        
        <div class="modal-body">
          <!-- 진행 단계 표시 -->
          <div class="step-indicator">
            <div class="step" :class="{ 'active': excelDownloadStep >= 1, 'completed': excelDownloadStep > 1 }">
              <span class="step-number">1</span>
              <span class="step-label">月選択</span>
            </div>
            <div class="step-line" :class="{ 'completed': excelDownloadStep > 1 }"></div>
            <div class="step" :class="{ 'active': excelDownloadStep >= 2, 'completed': excelDownloadStep > 2 }">
              <span class="step-number">2</span>
              <span class="step-label">会社選択</span>
            </div>
            <div class="step-line" :class="{ 'completed': excelDownloadStep > 2 }"></div>
            <div class="step" :class="{ 'active': excelDownloadStep >= 3, 'completed': excelDownloadStep > 2 }">
              <span class="step-number">3</span>
              <span class="step-label">施設選択</span>
            </div>
          </div>

          <!-- 단계별 내용 -->
          <div class="step-content">
            <!-- 1단계: 월 선택 -->
            <div v-if="excelDownloadStep === 1" class="step-panel">
              <h4>ダウンロードする月を選択してください</h4>
              <div class="form-group">
                <label>月選択 <span class="required">*</span></label>
                <input 
                  type="month" 
                  v-model="excelDownloadForm.selectedMonth"
                  class="form-input"
                  required
                >
              </div>
            </div>

            <!-- 2단계: 회사 선택 -->
            <div v-if="excelDownloadStep === 2" class="step-panel">
              <h4>会社を選択してください</h4>
              <div class="form-group">
                <label>会社選択 <span class="required">*</span></label>
                <select 
                  v-model="excelDownloadForm.selectedCompanyId"
                  class="form-input"
                  required
                >
                  <option value="">会社を選択してください</option>
                  <option 
                    v-for="company in store.companies" 
                    :key="company.id" 
                    :value="company.id"
                  >
                    {{ company.name }}
                  </option>
                </select>
              </div>
            </div>

            <!-- 3단계: 시설 선택 -->
            <div v-if="excelDownloadStep === 3" class="step-panel">
              <h4>施設を選択してください</h4>
              <div class="form-group">
                <label>施設選択 <span class="required">*</span></label>
                <select 
                  v-model="excelDownloadForm.selectedFacilityId"
                  class="form-input"
                  required
                >
                  <option value="">施設を選択してください</option>
                  <option 
                    v-for="facility in availableFacilities" 
                    :key="facility.id" 
                    :value="facility.id"
                  >
                    {{ facility.name }}
                  </option>
                </select>
              </div>
              
              <div class="download-info">
                <p>選択した施設の<strong>個別従業員別</strong>勤務統計をエクセルファイルでダウンロードします。</p>
              </div>
            </div>
          </div>

          <!-- 모달 하단 버튼 -->
          <div class="modal-actions">
            <button 
              v-if="excelDownloadStep > 1"
              @click="prevStep"
              class="btn-secondary"
            >
              前へ
            </button>
            
            <button 
              v-if="excelDownloadStep < 3"
              @click="nextStep"
              :disabled="!canProceedToNext"
              class="btn-primary"
            >
              次へ
            </button>
            
            <div v-if="excelDownloadStep === 3">              
              <button 
                @click="downloadExcel"
                :disabled="!canProceedToNext || downloadingExcel"
                class="btn-primary download-btn"
              >
                {{ downloadingExcel ? 'ダウンロード中...' : '📊 エクセルダウンロード' }}
              </button>
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
  padding: 3rem;
  font-size: 1.1rem;
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
  font-size: 1.3rem;
}

.loading-spinner {
  width: 70px;
  height: 70px;
  border: 5px solid rgba(255, 255, 255, 0.3);
  border-top: 5px solid white;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 1.5rem;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.error-message {
  background: #f8d7da;
  color: #721c24;
  padding: 1.5rem 3rem;
  margin: 1.5rem 0;
  border-radius: 12px;
  border: 2px solid #f5c6cb;
  text-align: center;
  font-weight: 500;
  font-size: 1.2rem;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 3rem;
  padding: 3rem;
  background: rgba(255, 255, 255, 0.9);
  border-radius: 20px;
  box-shadow: 0 6px 25px rgba(0, 0, 0, 0.1);
}

.page-header h1 {
  margin: 0;
  color: #2c3e50;
  font-size: 2.5rem;
  font-weight: 600;
}

.current-time {
  font-size: 1.5rem;
  color: #7f8c8d;
  font-weight: 500;
}

.admin-section {
  background: linear-gradient(135deg, rgba(52, 152, 219, 0.15), rgba(52, 152, 219, 0.08));
  padding: 3rem;
  border-radius: 20px;
  box-shadow: 0 6px 25px rgba(0, 0, 0, 0.1);
  margin-bottom: 3rem;
  border: 3px solid #3498db;
  position: relative;
  overflow: hidden;
  backdrop-filter: blur(10px);
}

.admin-section::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 4px;
  background: linear-gradient(90deg, #3498db, #2980b9, #3498db);
}

.admin-section::after {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(255, 255, 255, 0.9);
  z-index: -1;
  border-radius: 20px;
}

@keyframes shimmer {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}

.admin-section-header {
  display: flex;
  align-items: center;
  gap: 1.5rem;
  margin-bottom: 2rem;
  padding-bottom: 1.5rem;
  border-bottom: 2px solid rgba(52, 152, 219, 0.2);
}

.admin-section-header h3 {
  margin: 0;
  color: #2c3e50;
  font-size: 1.8rem;
  font-weight: 600;
  flex: 1;
}

.admin-toggle-btn {
  background: #3498db;
  color: white;
  border: none;
  padding: 0.5rem 1rem;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.9rem;
  transition: all 0.3s ease;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 500;
}

.admin-toggle-btn:hover {
  background: #2980b9;
  transform: translateY(-1px);
}

.admin-toggle-btn.expanded {
  background: #2980b9;
}

.admin-section-content {
  animation: slideDown 0.3s ease-out;
}

@keyframes slideDown {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.admin-badge {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  background: linear-gradient(135deg, #3498db, #2980b9);
  color: white;
  padding: 0.75rem 1.5rem;
  border-radius: 25px;
  font-weight: 600;
  font-size: 1rem;
  box-shadow: 0 4px 15px rgba(52, 152, 219, 0.3);
}

.admin-icon {
  font-size: 1.2rem;
}

.admin-text {
  font-size: 0.9rem;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.excel-download-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.5rem;
  text-align: center;
}

.excel-download-description {
  color: #7f8c8d;
  font-size: 1rem;
  margin: 0;
  max-width: 500px;
  line-height: 1.5;
}

.control-section {
  background: rgba(255, 255, 255, 0.9);
  padding: 3rem;
  border-radius: 20px;
  box-shadow: 0 6px 25px rgba(0, 0, 0, 0.1);
  margin-bottom: 3rem;
  display: flex;
  gap: 3rem;
  flex-wrap: wrap;
  align-items: flex-end;
}

.company-selector {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  min-width: 400px;
}

.company-selector label {
  font-weight: 600;
  color: #2c3e50;
  font-size: 1.2rem;
}

.company-select {
  padding: 1rem;
  border: 3px solid #e0e0e0;
  border-radius: 12px;
  font-size: 1.2rem;
  background: white;
  transition: border-color 0.3s ease;
}

.company-select:focus {
  outline: none;
  border-color: #667eea;
}

.company-select:disabled {
  background-color: #f8f9fa;
  color: #6c757d;
  cursor: not-allowed;
}

.staff-notice {
  margin-top: 0.5rem;
  color: #6c757d;
  font-style: italic;
}

.loading-notice {
  margin-top: 0.5rem;
  color: #3498db;
  font-style: italic;
}

.employee-selector {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  min-width: 400px;
}

.employee-selector label {
  font-weight: 600;
  color: #2c3e50;
  font-size: 1.2rem;
}

.employee-select {
  padding: 1rem;
  border: 3px solid #e0e0e0;
  border-radius: 12px;
  font-size: 1.2rem;
  background: white;
  transition: border-color 0.3s ease;
}

.employee-select:focus {
  outline: none;
  border-color: #667eea;
}

.date-range-selector {
  display: flex;
  gap: 2rem;
  flex-wrap: wrap;
}

.date-input {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.date-input label {
  font-weight: 600;
  color: #2c3e50;
  white-space: nowrap;
  font-size: 1.2rem;
}

.date-input-field {
  padding: 1rem;
  border: 3px solid #e0e0e0;
  border-radius: 12px;
  font-size: 1.2rem;
  background: white;
  transition: border-color 0.3s ease;
}

.date-input-field:focus {
  outline: none;
  border-color: #667eea;
}

.date-input-field.error {
  border-color: #e74c3c;
  background-color: #fdf2f2;
}

.employee-info {
  background: rgba(255, 255, 255, 0.9);
  padding: 3rem;
  border-radius: 20px;
  box-shadow: 0 6px 25px rgba(0, 0, 0, 0.1);
  margin-bottom: 3rem;
}

.employee-info h2 {
  margin: 0 0 2rem 0;
  color: #2c3e50;
  font-size: 2rem;
}

.employee-details {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 2rem;
}

.detail-item {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.detail-item .label {
  font-size: 1.1rem;
  color: #7f8c8d;
  font-weight: 500;
}

.detail-item .value {
  font-size: 1.4rem;
  color: #2c3e50;
  font-weight: 600;
}

.work-stats {
  background: rgba(255, 255, 255, 0.9);
  padding: 3rem;
  border-radius: 20px;
  box-shadow: 0 6px 25px rgba(0, 0, 0, 0.1);
  margin-bottom: 3rem;
}

.work-stats h2 {
  margin: 0 0 2rem 0;
  color: #2c3e50;
  font-size: 2rem;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 2rem;
}

.stat-card {
  display: flex;
  align-items: center;
  gap: 1.5rem;
  background: rgba(255, 255, 255, 0.8);
  padding: 2rem;
  border-radius: 16px;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
  transition: transform 0.3s ease;
}

.stat-card:hover {
  transform: translateY(-3px);
}

.stat-icon {
  font-size: 3rem;
  flex-shrink: 0;
}

.stat-content {
  display: flex;
  flex-direction: column;
}

.stat-number {
  font-size: 2rem;
  font-weight: 700;
  color: #2c3e50;
  line-height: 1;
}

.stat-label {
  font-size: 1.1rem;
  color: #7f8c8d;
  margin-top: 0.5rem;
}

.stat-excluded {
  font-size: 0.9rem;
  color: #e74c3c;
  margin-top: 0.5rem;
  font-style: italic;
  opacity: 0.8;
}

.stat-tip {
  font-size: 0.9rem;
  color: #e74c3c;
  margin-top: 0.5rem;
  font-style: italic;
  opacity: 0.8;
}

.work-records {
  background: rgba(255, 255, 255, 0.9);
  padding: 3rem;
  border-radius: 20px;
  box-shadow: 0 6px 25px rgba(0, 0, 0, 0.1);
}

.work-records h2 {
  margin: 0 0 2rem 0;
  color: #2c3e50;
  font-size: 2rem;
}

.no-records {
  text-align: center;
  color: #7f8c8d;
  font-style: italic;
  padding: 4rem;
  background: rgba(255, 255, 255, 0.5);
  border-radius: 12px;
  font-size: 1.3rem;
}

.records-table {
  width: 100%;
  overflow-x: auto;
  min-width: 0;
  display: block;
}

.records-table table {
  min-width: 1400px;
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
}

.records-table th, .records-table td {
  white-space: nowrap;
  padding: 1rem 1.5rem;
  text-align: left;
  font-size: 1.1rem;
  color: #2c3e50;
  background: #fff;
}

.records-table th {
  background: #f8f9fa;
  font-weight: 600;
  font-size: 1.2rem;
}

.records-table tr {
  background: rgba(255,255,255,0.8);
}

:deep(tr.timeDifference) > td {
  background: rgba(231, 76, 60, 0.1);
}

.cell {
  padding: 1rem;
  font-size: 1.1rem;
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
  padding: 0.5rem 1.5rem;
  border-radius: 16px;
  font-size: 0.9rem;
  font-weight: 600;
  color: white;
  background: #e74c3c;
  white-space: nowrap;
}

.expected-checkin,
.expected-checkout {
  color: #7f8c8d;
  font-family: monospace;
  font-size: 1.1rem;
}

.break-time-cell,
.checkin-cell,
.checkout-cell {
  color: #2c3e50;
  font-family: monospace;
  font-weight: 500;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  font-size: 1.1rem;
}

.time-display {
  font-size: 1.1rem;
}

.time-difference {
  color: #e74c3c;
  font-weight: 600;
  padding: 0.2rem 0.5rem;
  border-radius: 6px;
  white-space: nowrap;
  font-size: 1rem;
}

.hours-cell {
  color: #2c3e50;
  font-weight: 600;
  font-size: 1.1rem;
}

.status-badge {
  padding: 0.8rem 1.5rem;
  border-radius: 30px;
  color: white;
  font-size: 1rem;
  font-weight: 600;
  text-align: center;
  white-space: nowrap;
  min-width: 80px;
  display: inline-block;
}

.work-type-cell {
  text-align: center;
}

.work-type-badge {
  padding: 0.5rem 1.5rem;
  border-radius: 16px;
  font-size: 0.9rem;
  font-weight: 600;
  color: white;
  background: #3498db;
  white-space: nowrap;
}

.shift-stats {
  margin-top: 3rem;
  padding-top: 3rem;
  border-top: 3px solid #ecf0f1;
}

.shift-stats h3 {
  margin: 0 0 2rem 0;
  color: #2c3e50;
  font-size: 1.8rem;
  font-weight: 600;
}

.shift-card {
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.9), rgba(255, 255, 255, 0.7));
  border: 3px solid #ecf0f1;
}

.shift-card:hover {
  border-color: #3498db;
  transform: translateY(-4px);
  box-shadow: 0 8px 25px rgba(0, 0, 0, 0.15);
}

.stat-subtitle {
  font-size: 0.9rem;
  color: #95a5a6;
  margin-top: 0.3rem;
  font-weight: 500;
}

.red-font {
  color: #e74c3c;
}

.shift-hours-cell {
  font-weight: 600;
  color: #2c3e50;
  font-family: monospace;
  font-size: 1rem;
}

.salary-section {
  margin-top: 3rem;
  padding-top: 3rem;
  border-top: 3px solid #ecf0f1;
}

.salary-section h3 {
  margin: 0 0 2rem 0;
  color: #2c3e50;
  font-size: 1.8rem;
  font-weight: 600;
}

.hourly-rates {
  display: flex;
  gap: 2rem;
  flex-wrap: wrap;
}

.rate-input {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.rate-input label {
  font-weight: 600;
  color: #2c3e50;
  font-size: 1.2rem;
}

.rate-input-field {
  padding: 1rem;
  border: 3px solid #e0e0e0;
  border-radius: 12px;
  font-size: 1.2rem;
  background: white;
  transition: border-color 0.3s ease;
}

.rate-input-field:focus {
  outline: none;
  border-color: #667eea;
}

.currency {
  font-size: 1rem;
  color: #7f8c8d;
  font-weight: 500;
}

.rate-display-section {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 2rem;
  margin-top: 2rem;
  padding: 2rem;
  background: rgba(255, 255, 255, 0.5);
  border-radius: 12px;
  border: 2px solid #ecf0f1;
}

.rate-display-item {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 1.5rem;
  background: rgba(255, 255, 255, 0.8);
  border-radius: 10px;
  border: 2px solid #ecf0f1;
}

.rate-label {
  font-size: 1.1rem;
  font-weight: 600;
  color: #2c3e50;
}

.rate-value {
  font-size: 1.4rem;
  font-weight: 700;
  color: #2c3e50;
}

.rate-note {
  font-size: 0.9rem;
  color: #7f8c8d;
  font-style: italic;
}

.holiday-rate {
  background: rgba(231, 76, 60, 0.1);
  border-color: rgba(231, 76, 60, 0.2);
}

.holiday-rate .rate-value {
  color: #e74c3c;
}

.holiday-rate .rate-note {
  color: #e74c3c;
}

.salary-calculation {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 2rem;
  margin-top: 2rem;
}

.salary-card {
  display: flex;
  align-items: center;
  gap: 1.5rem;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.9), rgba(255, 255, 255, 0.7));
  padding: 2rem;
  border-radius: 16px;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
  transition: transform 0.3s ease;
  border: 3px solid #ecf0f1;
}

.salary-card:hover {
  transform: translateY(-3px);
  border-color: #3498db;
  box-shadow: 0 8px 25px rgba(0, 0, 0, 0.15);
}

.salary-icon {
  font-size: 3rem;
  flex-shrink: 0;
}

.salary-content {
  display: flex;
  flex-direction: column;
  flex: 1;
}

.salary-number {
  font-size: 2rem;
  font-weight: 700;
  color: #2c3e50;
  line-height: 1;
}

.salary-label {
  font-size: 1.1rem;
  color: #7f8c8d;
  margin-top: 0.5rem;
}

.salary-detail {
  font-size: 0.9rem;
  color: #95a5a6;
  margin-top: 0.5rem;
}

.total-salary {
  background: linear-gradient(135deg, rgba(52, 152, 219, 0.1), rgba(52, 152, 219, 0.05));
  border-color: #3498db;
}

.total-salary .salary-number {
  color: #2980b9;
}

.holiday-salary {
  background: linear-gradient(135deg, rgba(231, 76, 60, 0.1), rgba(231, 76, 60, 0.05));
  border-color: #e74c3c;
}

.holiday-salary .salary-number {
  color: #c0392b;
}

.holiday-salary .salary-label {
  color: #e74c3c;
}

/* 수정요청 버튼 스타일 */
.change-request-btn {
  background: #3498db;
  color: white;
  border: none;
  padding: 0.5rem 1rem;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.9rem;
  transition: background-color 0.3s ease;
}

.change-request-btn:hover {
  background: #2980b9;
}

/* 등록요청 버튼 스타일 */
.work-records-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2rem;
}

.work-records-header h2 {
  margin: 0;
}

.registration-request-btn {
  background: #27ae60;
  color: white;
  border: none;
  padding: 0.75rem 1.5rem;
  border-radius: 8px;
  cursor: pointer;
  font-size: 1rem;
  font-weight: 600;
  transition: background-color 0.3s ease;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.registration-request-btn:hover {
  background: #229954;
}

.registration-request-btn.disabled,
.change-request-btn.disabled {
  background: #bdc3c7 !important;
  cursor: not-allowed;
  opacity: 0.6;
}

/* 요청보낸 리스트 스타일 */
.requests-section {
  margin-top: 3rem;
  background: rgba(255, 255, 255, 0.9);
  border-radius: 20px;
  box-shadow: 0 6px 25px rgba(0, 0, 0, 0.1);
  padding: 2rem;
}

.requests-section h3 {
  margin: 0 0 1.5rem 0;
  color: #2c3e50;
  font-size: 1.5rem;
  font-weight: 600;
}

.requests-table table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9rem;
  color: #2c3e50;
}

.requests-table th,
.requests-table td {
  padding: 0.75rem;
  text-align: left;
  border-bottom: 1px solid #e0e0e0;
}

.requests-table th {
  background: #f8f9fa;
  font-weight: 600;
  color: #2c3e50;
}

.request-type {
  background: #3498db;
  color: white;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  font-size: 0.8rem;
  font-weight: 600;
}

.request-type-badge {
  color: white;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  font-size: 0.8rem;
  font-weight: 600;
  display: inline-block;
}

.reason-cell {
  max-width: 200px;
}

.reason-text {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 180px;
}

.time-inputs {
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  padding: 1rem;
  margin-bottom: 1rem;
  background: #f8f9fa;
}



/* 모달 스타일 */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  background: white;
  border-radius: 12px;
  width: 90%;
  max-width: 600px;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1.5rem 2rem;
  border-bottom: 2px solid #e0e0e0;
}

.modal-header h3 {
  margin: 0;
  color: #2c3e50;
  font-size: 1.5rem;
}

.close-btn {
  background: none;
  border: none;
  font-size: 2rem;
  cursor: pointer;
  color: #7f8c8d;
  padding: 0;
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.close-btn:hover {
  color: #e74c3c;
}

.modal-body {
  padding: 2rem;
}

.record-info {
  background: #f8f9fa;
  padding: 1rem;
  border-radius: 8px;
  margin-bottom: 1.5rem;
}

.record-info p {
  margin: 0.5rem 0;
  color: #2c3e50;
}

.change-request-form {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.form-group label {
  font-weight: 600;
  color: #2c3e50;
  font-size: 1rem;
}

.required {
  color: #e74c3c;
}

.form-input,
.form-textarea {
  padding: 0.75rem;
  border: 2px solid #e0e0e0;
  border-radius: 6px;
  font-size: 1rem;
  transition: border-color 0.3s ease;
}

.form-input:focus,
.form-textarea:focus {
  outline: none;
  border-color: #3498db;
}

.form-input.error {
  border-color: #e74c3c;
  background-color: #fdf2f2;
}

.time-select {
  padding: 0.75rem;
  border: 2px solid #e0e0e0;
  border-radius: 6px;
  font-size: 1rem;
  background: white;
  transition: border-color 0.3s ease;
  cursor: pointer;
}

.time-select:focus {
  outline: none;
  border-color: #3498db;
}

.time-select:hover {
  border-color: #3498db;
}

.time-select:disabled {
  background-color: #f8f9fa;
  color: #6c757d;
  cursor: not-allowed;
  opacity: 0.6;
}

.time-select:disabled:hover {
  border-color: #e0e0e0;
}

.error-message {
  color: #e74c3c;
  font-size: 0.9rem;
  margin-top: 0.5rem;
  font-weight: 500;
}

.form-textarea {
  min-height: 100px;
  resize: vertical;
}

.form-actions {
  display: flex;
  gap: 1rem;
  justify-content: flex-end;
  margin-top: 1rem;
}

.btn-primary,
.btn-secondary {
  padding: 0.75rem 1.5rem;
  border: none;
  border-radius: 6px;
  font-size: 1rem;
  cursor: pointer;
  transition: all 0.3s ease;
}

.btn-primary {
  background: #3498db;
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: #2980b9;
}

.btn-primary:disabled {
  background: #bdc3c7;
  cursor: not-allowed;
}

.btn-secondary {
  background: #95a5a6;
  color: white;
}

.btn-secondary:hover {
  background: #7f8c8d;
}

@media (max-width: 768px) {
  .employees-info-page {
    padding: 2rem;
    font-size: 1.2rem;
  }

  .page-header {
    flex-direction: column;
    gap: 2rem;
    text-align: center;
    padding: 2rem;
  }

  .page-header h1 {
    font-size: 2rem;
  }

  .control-section {
    flex-direction: column;
    gap: 2rem;
    padding: 2rem;
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
    gap: 1rem;
  }

  .header-cell {
    display: none;
  }

  .cell {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem 0;
    border-bottom: 2px solid #e0e0e0;
  }

  .cell::before {
    content: attr(data-label);
    font-weight: 600;
    color: #2c3e50;
    margin-right: 2rem;
    font-size: 1.2rem;
  }
}

.records-table th:first-child,
.records-table td:first-child {
  position: sticky;
  left: 0;
  z-index: 2;
  background: #f8f9fa;
  box-shadow: 3px 0 6px -3px #eee;
}

.excel-download-btn {
  background: linear-gradient(135deg, #27ae60, #2ecc71);
  color: white;
  border: none;
  padding: 1rem 2rem;
  border-radius: 12px;
  font-size: 1.2rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
  box-shadow: 0 4px 15px rgba(39, 174, 96, 0.3);
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
}

.excel-download-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(39, 174, 96, 0.4);
}

.excel-download-modal {
  max-width: 700px;
}

.step-indicator {
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 2rem;
  gap: 1rem;
}

.step {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  position: relative;
}

.step-number {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: #e0e0e0;
  color: #7f8c8d;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  font-size: 1.1rem;
  transition: all 0.3s ease;
}

.step.active .step-number {
  background: #3498db;
  color: white;
}

.step.completed .step-number {
  background: #27ae60;
  color: white;
}

.step-label {
  font-size: 0.9rem;
  color: #7f8c8d;
  font-weight: 500;
  white-space: nowrap;
}

.step.active .step-label {
  color: #3498db;
  font-weight: 600;
}

.step.completed .step-label {
  color: #27ae60;
  font-weight: 600;
}

.step-line {
  width: 60px;
  height: 3px;
  background: #e0e0e0;
  transition: background-color 0.3s ease;
}

.step-line.completed {
  background: #27ae60;
}

.step-content {
  min-height: 200px;
  margin-bottom: 2rem;
}

.step-panel {
  text-align: center;
}

.step-panel h4 {
  margin: 0 0 1.5rem 0;
  color: #2c3e50;
  font-size: 1.3rem;
  font-weight: 600;
}

.modal-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 1.5rem;
  border-top: 2px solid #e0e0e0;
}

.modal-actions .btn-secondary {
  background: #95a5a6;
  color: white;
  border: none;
  padding: 0.75rem 1.5rem;
  border-radius: 6px;
  font-size: 1rem;
  cursor: pointer;
  transition: background-color 0.3s ease;
}

.modal-actions .btn-secondary:hover {
  background: #7f8c8d;
}

.modal-actions .btn-primary {
  background: #3498db;
  color: white;
  border: none;
  padding: 0.75rem 1.5rem;
  border-radius: 6px;
  font-size: 1rem;
  cursor: pointer;
  transition: background-color 0.3s ease;
}

.modal-actions .btn-primary:hover:not(:disabled) {
  background: #2980b9;
}

.modal-actions .btn-primary:disabled {
  background: #bdc3c7 !important;
  cursor: not-allowed;
}



.final-actions {
  display: flex;
  gap: 1rem;
  justify-content: space-between;
  width: 85%;
}

.download-btn {
  background: linear-gradient(135deg, #27ae60, #2ecc71) !important;
  font-weight: 600;
  padding: 0.75rem 2rem;
}

.download-btn:hover:not(:disabled) {
  background: linear-gradient(135deg, #229954, #27ae60) !important;
  transform: translateY(-1px);
}

.download-btn:disabled {
  background: #bdc3c7 !important;
  transform: none;
}

.download-info {
  margin-top: 2rem;
  padding: 1.5rem;
  background: #f8f9fa;
  border-radius: 8px;
  border: 1px solid #e0e0e0;
}

.download-info p {
  margin: 0 0 1rem 0;
  color: #2c3e50;
  font-weight: 500;
}

.download-info ul {
  margin: 0;
  padding-left: 1.5rem;
  color: #7f8c8d;
}

.download-info li {
  margin-bottom: 0.5rem;
}

.admin-toggle-btn {
  background: #3498db;
  color: white;
  border: none;
  padding: 0.5rem 1rem;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.9rem;
  transition: background-color 0.3s ease;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.admin-toggle-btn:hover {
  background: #2980b9;
}

.admin-toggle-btn.expanded {
  background: #2980b9;
}

.arrow-icon {
  font-size: 1.2rem;
  transition: transform 0.3s ease;
  display: inline-block;
}

.admin-toggle-btn.expanded .arrow-icon {
  transform: rotate(90deg);
}

.admin-toggle-btn:hover {
  background: #2980b9;
  transform: translateY(-1px);
}

.admin-toggle-btn.expanded:hover {
  transform: translateY(-1px);
}
</style> 