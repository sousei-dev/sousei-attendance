<script setup lang="ts">
import { useSupabaseAttendanceStore } from '../stores/supabaseAttendance'
import { computed, ref, onMounted, onUnmounted, nextTick } from 'vue'
import type { AttendanceRecord, Employee } from '../lib/supabase'
import { useAuthStore } from '../stores/auth'

const store = useSupabaseAttendanceStore()
const authStore = useAuthStore()
const searchQuery = ref('')
const currentTime = ref(new Date())
const formattedTime = ref('')
const formattedDate = ref('')
const showRefreshNotification = ref(false)

// 실시간 시간 업데이트
let timeInterval: ReturnType<typeof setInterval> | null = null

// 캐시 초기화 함수
const clearCache = () => {
  employeeRecordCache.value = {}
  employeeExpectedTimes.value = {}
}

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
  try {
    // 캐시 완전 초기화
    clearCache()
    
    // 이미 데이터가 로드되어 있는지 확인
    if (store.employees.length === 0 || store.attendanceRecords.length === 0) {
      // Supabase 데이터 초기화
      await store.initialize()
      
      // 데이터 다시 로드
      await store.loadAttendanceRecords()
    }
    
    // 강제로 computed 재계산을 위한 지연
    await new Promise(resolve => setTimeout(resolve, 200))

    // 초기 포맷팅
    updateFormattedTime()
    updateFormattedDate()

    // 통합된 시간 업데이트 (성능 최적화: 10초마다)
    timeInterval = setInterval(() => {
      try {
        const newTime = new Date()
        const oldHour = currentTime.value.getHours()
        const newHour = newTime.getHours()
        const oldDate = currentTime.value.getDate()
        const newDate = newTime.getDate()
        
        // 날짜가 바뀌었을 때 (00시 경과) 페이지 새로고침
        if (oldDate !== newDate) {
          console.log('날짜가 바뀌었습니다. 페이지를 새로고침합니다.')
          showRefreshNotification.value = true
          // 3초 후 새로고침
          setTimeout(() => {
            window.location.reload()
          }, 3000)
          return
        }
        
        // 시간이 바뀌면 캐시 초기화 (특히 00시, 06시, 18시)
        if (oldHour !== newHour) {
          clearCache()
        }
        
        currentTime.value = newTime
        updateFormattedTime()
        updateFormattedDate()
      } catch (error) {
        console.error('시간 업데이트 중 오류 발생:', error)
      }
    }, 1000) // 10초마다 업데이트로 성능 최적화
    
  } catch (error) {
    console.error('페이지 초기화 중 에러 발생:', error)
    // 에러 발생 시에도 로딩 상태를 false로 설정
    store.loading = false
  }
})

onUnmounted(() => {
  if (timeInterval) {
    clearInterval(timeInterval)
  }
})

const todayStats = computed(() => {
  const totalEmployees = store.activeEmployees.length
  let checkedIn = 0
  let checkedOut = 0

  // activeEmployees를 기준으로 출근/퇴근 상태 계산
  store.activeEmployees.forEach(employee => {
    const record = employeeRecords.value[employee.id]
    if (record) {
      if (record.check_in) checkedIn++
      if (record.check_out) checkedOut++
    }
  })

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
      (employee.facility_id && store.getFacilityName(employee.facility_id).toLowerCase().includes(searchQuery.value.toLowerCase())) ||
      employee.category_1.toLowerCase().includes(searchQuery.value.toLowerCase()),
  )
})

// 직원별 기록 캐시 (야간 근무 고려)
const employeeRecordCache = ref<Record<string, { record: AttendanceRecord | null; lastUpdate: number }>>({})

// 직원별 기록을 computed로 관리
const employeeRecords = computed(() => {
  // store가 아직 초기화되지 않았거나 로딩 중이면 빈 객체 반환
  if (store.loading || !store.activeEmployees.length || !store.attendanceRecords.length) {
    return {}
  }
  
  const records: Record<string, AttendanceRecord | null> = {}
  
  filteredEmployees.value.forEach(employee => {
    // 캐시된 기록이 있고 최신이면 반환 (캐시 시간 단축)
    const cached = employeeRecordCache.value[employee.id]
    const now = Date.now()
    if (cached && (now - cached.lastUpdate) < 200) { // 200ms로 단축하여 더 빠른 업데이트
      records[employee.id] = cached.record
      return
    }

    let record: AttendanceRecord | null = null
    
    // 먼저 오늘 기록 확인
    record = store.getEmployeeRecord(employee.id, store.currentDate)
    
    // 오늘 기록이 없으면 전날 기록 확인 (야간 근무자만, 아직 퇴근하지 않은 경우)
    if (!record) {
      const yesterday = new Date()
      yesterday.setDate(yesterday.getDate() - 1)
      const year = yesterday.getFullYear()
      const month = String(yesterday.getMonth() + 1).padStart(2, '0')
      const day = String(yesterday.getDate()).padStart(2, '0')
      const yesterdayDate = `${year}-${month}-${day}`
      const yesterdayRecord = store.getEmployeeRecord(employee.id, yesterdayDate)
      
      // 야간 근무자이고 아직 퇴근하지 않은 경우만
      if (yesterdayRecord && yesterdayRecord.is_night_shift && yesterdayRecord.check_in && !yesterdayRecord.check_out) {
        record = yesterdayRecord
      }
    }
    
    // 여전히 기록이 없으면 다음날 기록 확인 (야간 근무자만)
    if (!record) {
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      const year = tomorrow.getFullYear()
      const month = String(tomorrow.getMonth() + 1).padStart(2, '0')
      const day = String(tomorrow.getDate()).padStart(2, '0')
      const tomorrowDate = `${year}-${month}-${day}`
      const tomorrowRecord = store.getEmployeeRecord(employee.id, tomorrowDate)
      
      // 야간 근무자만
      if (tomorrowRecord && tomorrowRecord.is_night_shift) {
        record = tomorrowRecord
      }
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
  if (store.loading || !store.activeEmployees.length || !store.attendanceRecords.length) {
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
  if (isNightShift) {
    if (status === 'checked-in') {
      return '勤務中(夜勤)'
    } else if (status === 'checked-out') {
      return '退勤中'
    }
  }
  
  return baseText
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
      // 예상 시간 가져오기
      const scheduledCheckIn = getEmployeeExpectedTime(employeeId, 'checkIn')
      const scheduledCheckOut = getEmployeeExpectedTime(employeeId, 'checkOut')
      const breakTime = getEmployeeExpectedTime(employeeId, 'breakTime')
      
      // HH:MM 형식을 HH:MM:SS 형식으로 변환
      const formatTimeForDB = (time: string): string | undefined => {
        if (time === '00:00') return undefined
        return `${time}:00`
      }
      
      await store.checkIn(
        employeeId, 
        formatTimeForDB(scheduledCheckIn), 
        formatTimeForDB(scheduledCheckOut), 
        formatTimeForDB(breakTime)
      )
    } else if (status === 'checked-in') {
      await store.checkOut(employeeId)
    }
    
    // 캐시 완전 무효화
    clearCache()
    
    // 데이터 다시 로드
    await store.loadAttendanceRecords()
    
    // 강제로 computed 재계산을 위한 지연 (시간 증가)
    await new Promise(resolve => setTimeout(resolve, 200))
    
    // 추가로 한 번 더 캐시 무효화하여 확실히 업데이트
    clearCache()
    
    // 강제로 Vue 반응성 시스템 트리거
    await nextTick()
  } catch (error) {
    console.error('出退勤処理中にエラーが発生しました:', error)
  }
  showEmployeeModal.value = false
}

const isButtonDisabled = (employeeId: string) => {
  const status = getEmployeeStatus(employeeId)
  // 이미 퇴근한 경우
  if (status === 'checked-out') {
    return true
  }
  if (status === 'checked-in') {
    return true
  }
  // 출근하지 않은 상태에서 예상 출근/퇴근 시간이 모두 입력되지 않은 경우
  if (status === 'not-checked') {
    const checkIn = getEmployeeExpectedTime(employeeId, 'checkIn')
    const checkOut = getEmployeeExpectedTime(employeeId, 'checkOut')
    if (checkIn === '00:00' || checkOut === '00:00') {
      return true
    }
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
    let record: AttendanceRecord | null = null
    
    // 먼저 오늘 기록 확인
    record = store.getEmployeeRecord(employeeId, store.currentDate)
    
    // 오늘 기록이 없으면 전날 야간 근무 기록 확인 (야간 근무자만)
    if (!record) {
      const yesterday = new Date()
      yesterday.setDate(yesterday.getDate() - 1)
      const year = yesterday.getFullYear()
      const month = String(yesterday.getMonth() + 1).padStart(2, '0')
      const day = String(yesterday.getDate()).padStart(2, '0')
      const yesterdayDate = `${year}-${month}-${day}`
      const yesterdayRecord = store.getEmployeeRecord(employeeId, yesterdayDate)
      if (yesterdayRecord && yesterdayRecord.is_night_shift) {
        record = yesterdayRecord
      }
    }
    
    // 여전히 기록이 없으면 다음날 야간 근무 기록 확인 (야간 근무자만)
    if (!record) {
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      const year = tomorrow.getFullYear()
      const month = String(tomorrow.getMonth() + 1).padStart(2, '0')
      const day = String(tomorrow.getDate()).padStart(2, '0')
      const tomorrowDate = `${year}-${month}-${day}`
      const tomorrowRecord = store.getEmployeeRecord(employeeId, tomorrowDate)
      if (tomorrowRecord && tomorrowRecord.is_night_shift) {
        record = tomorrowRecord
      }
    }
    
    const scheduledCheckIn = formatTimeForSelect(record?.scheduled_check_in ?? undefined)
    const scheduledCheckOut = formatTimeForSelect(record?.scheduled_check_out ?? undefined)
    const breakTime = formatTimeForSelect(record?.break_time ?? undefined)
    
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
    let record: AttendanceRecord | null = null
    
    // 먼저 오늘 기록 확인
    record = store.getEmployeeRecord(employeeId, store.currentDate)
    
    // 오늘 기록이 없으면 전날 야간 근무 기록 확인 (야간 근무자만)
    if (!record) {
      const yesterday = new Date()
      yesterday.setDate(yesterday.getDate() - 1)
      const year = yesterday.getFullYear()
      const month = String(yesterday.getMonth() + 1).padStart(2, '0')
      const day = String(yesterday.getDate()).padStart(2, '0')
      const yesterdayDate = `${year}-${month}-${day}`
      const yesterdayRecord = store.getEmployeeRecord(employeeId, yesterdayDate)
      if (yesterdayRecord && yesterdayRecord.is_night_shift) {
        record = yesterdayRecord
      }
    }
    
    // 여전히 기록이 없으면 다음날 야간 근무 기록 확인 (야간 근무자만)
    if (!record) {
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      const year = tomorrow.getFullYear()
      const month = String(tomorrow.getMonth() + 1).padStart(2, '0')
      const day = String(tomorrow.getDate()).padStart(2, '0')
      const tomorrowDate = `${year}-${month}-${day}`
      const tomorrowRecord = store.getEmployeeRecord(employeeId, tomorrowDate)
      if (tomorrowRecord && tomorrowRecord.is_night_shift) {
        record = tomorrowRecord
      }
    }
    
    const scheduledCheckIn = formatTimeForSelect(record?.scheduled_check_in ?? undefined)
    const scheduledCheckOut = formatTimeForSelect(record?.scheduled_check_out ?? undefined)
    const breakTime = formatTimeForSelect(record?.break_time ?? undefined)
    
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
    if (workHours >= 14) {
      setEmployeeExpectedTime(employeeId, 'breakTime', '03:00')
    } else if (workHours >= 6) {
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

// 日勤 설정 함수
const setDayShift = (employeeId: string) => {
  setEmployeeExpectedTime(employeeId, 'checkIn', '09:00')
  setEmployeeExpectedTime(employeeId, 'checkOut', '18:00')
  setEmployeeExpectedTime(employeeId, 'breakTime', '01:00')
}

// 夜勤 설정 함수
const setNightShift = (employeeId: string) => {
  setEmployeeExpectedTime(employeeId, 'checkIn', '16:30')
  setEmployeeExpectedTime(employeeId, 'checkOut', '09:30')
  setEmployeeExpectedTime(employeeId, 'breakTime', '03:00')
}

// 모달 상태 관리
const showEmployeeModal = ref(false)
const selectedEmployeeForModal = ref<Employee | null>(null)

const openEmployeeModal = (employee: Employee) => {
  selectedEmployeeForModal.value = employee
  showEmployeeModal.value = true
}

const closeEmployeeModal = () => {
  // 입력했던 값들 초기화 (모달을 닫기 전에 먼저 처리)
  if (selectedEmployeeForModal.value) {
    const employeeId = selectedEmployeeForModal.value.id
    // 해당 직원의 예상 시간 캐시 삭제
    delete employeeExpectedTimes.value[employeeId]
    // 해당 직원의 기록 캐시 삭제
    delete employeeRecordCache.value[employeeId]
  }
  
  showEmployeeModal.value = false
  selectedEmployeeForModal.value = null
}

// facility 이름 가져오기
// const getFacilityName = (facilityId: string) => {
//   const facilityNames: Record<string, string> = {
//     'FACILITY_001': '本社',
//     'FACILITY_002': '支店A',
//     'FACILITY_003': '支店B',
//     // 필요에 따라 더 추가
//   }
//   return facilityNames[facilityId] || facilityId
// }
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

    <!-- 새로고침 알림 -->
    <div v-if="showRefreshNotification" class="refresh-notification">
      <div class="refresh-content">
        <div class="refresh-icon">🔄</div>
        <div class="refresh-text">
          <div class="refresh-title">日付が変更されました</div>
          <div class="refresh-subtitle">3秒後にページを更新します...</div>
        </div>
      </div>
    </div>

    <div class="dashboard-header">
      <div class="header-content">
        <div class="header-left">
          <h1>
            出退勤システムダッシュボード
            <span v-if="authStore.isStaff && authStore.user?.facility_id" class="facility-name">
              - {{ store.getFacilityName(authStore.user.facility_id) }}
            </span>
          </h1>
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
          <div class="header-cell">状態</div>
        </div>

        <div v-if="filteredEmployees.length === 0" class="no-employees">
          {{ searchQuery ? '検索結果がありません。' : '登録された従業員がいません。' }}
        </div>

        <div v-else class="employee-rows">
          <div v-for="employee in filteredEmployees" :key="employee.id" class="employee-row" @click="openEmployeeModal(employee)">
            <div class="cell employee-code">{{ employee.employee_code }}</div>
            <div class="cell employee-name">{{ employee.last_name }}{{ employee.first_name }}</div>
            <div class="cell employee-dept">{{ employee.facility_id ? store.getFacilityName(employee.facility_id) : '-' }}</div>
            <div class="cell employee-position">{{ employee.category_1 }}</div>
            <div class="cell status">
              <span
                v-if="!store.loading"
                class="status-badge"
                :style="{ backgroundColor: getStatusColor(getEmployeeStatus(employee.id)) }"
              >
                {{ getStatusText(getEmployeeStatus(employee.id), getEmployeeRecordForDisplay(employee.id)?.is_night_shift) }}
              </span>
              <span v-else class="status-badge" style="background: #b2bec3;">読み込み中...</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-if="showEmployeeModal" class="employee-modal-overlay" @click.self="closeEmployeeModal">
      <div class="employee-modal">
        <button class="close-btn" @click="closeEmployeeModal" title="닫기">×</button>
        <h3>従業員詳細</h3>
        <div v-if="selectedEmployeeForModal" class="employee-modal-content">
          <div class="employee-header">
            <div class="employee-basic-info">
              <span class="employee-code">{{ selectedEmployeeForModal.employee_code }}</span>
              <span class="employee-name">{{ selectedEmployeeForModal.last_name }}{{ selectedEmployeeForModal.first_name }}</span>
            </div>
          </div>
          <div class="modal-main-section">
            <div class="modal-left-section">
              <div class="shift-type-buttons">
                <button
                  @click="setDayShift(selectedEmployeeForModal.id)"
                  :disabled="getEmployeeStatus(selectedEmployeeForModal.id) !== 'not-checked'"
                  class="shift-type-btn day-shift-btn"
                >
                  日勤
                </button>
                <button
                  @click="setNightShift(selectedEmployeeForModal.id)"
                  :disabled="getEmployeeStatus(selectedEmployeeForModal.id) !== 'not-checked'"
                  class="shift-type-btn night-shift-btn"
                >
                  夜勤
                </button>
              </div>
              <div class="input-section">
                <div>
                  <span class="info-label">予想出勤時間:</span>
                  <select
                    :value="getEmployeeExpectedTime(selectedEmployeeForModal.id, 'checkIn')"
                    @change="handleExpectedCheckInChange(selectedEmployeeForModal.id, $event)"
                    class="full-width-select"
                    :disabled="getEmployeeStatus(selectedEmployeeForModal.id) !== 'not-checked'"
                  >
                    <option v-for="time in timeOptions" :key="time" :value="time">{{ time }}</option>
                  </select>
                </div>
                <div>
                  <span class="info-label">予想退勤時間:</span>
                  <select
                    :value="getEmployeeExpectedTime(selectedEmployeeForModal.id, 'checkOut')"
                    @change="handleExpectedCheckOutChange(selectedEmployeeForModal.id, $event)"
                    class="full-width-select"
                    :disabled="getEmployeeStatus(selectedEmployeeForModal.id) !== 'not-checked'"
                  >
                    <option v-for="time in timeOptions" :key="time" :value="time">{{ time }}</option>
                  </select>
                </div>
                <div>
                  <span class="info-label">休憩時間:</span>
                  <select
                    :value="getEmployeeExpectedTime(selectedEmployeeForModal.id, 'breakTime')"
                    @change="handleBreakTimeChange(selectedEmployeeForModal.id, $event)"
                    class="full-width-select"
                    :disabled="getEmployeeStatus(selectedEmployeeForModal.id) !== 'not-checked'"
                  >
                    <option v-for="time in breakTimeOptions" :key="time" :value="time">{{ time }}</option>
                  </select>
                </div>
              </div>
            </div>
            <div class="modal-right-section">
              <div class="action-buttons">
                <button
                  @click="handleAttendanceAction(selectedEmployeeForModal.id)"
                  :disabled="isButtonDisabled(selectedEmployeeForModal.id) || store.loading"
                  class="attendance-btn check-in-btn"
                  :style="{ backgroundColor: getButtonColorWithExpectedTime(selectedEmployeeForModal.id, getEmployeeStatus(selectedEmployeeForModal.id)) }"
                >
                  出勤
                </button>
                <button
                  @click="handleAttendanceAction(selectedEmployeeForModal.id)"
                  :disabled="getEmployeeStatus(selectedEmployeeForModal.id) !== 'checked-in' || store.loading"
                  class="attendance-btn check-out-btn"
                  :style="{ backgroundColor: getEmployeeStatus(selectedEmployeeForModal.id) === 'checked-in' ? '#e74c3c' : '#95a5a6' }"
                >
                  退勤
                </button>
              </div>
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

.loading-overlay .loading-spinner {
  width: 70px;
  height: 70px;
  border: 5px solid rgba(255, 255, 255, 0.3);
  border-top: 5px solid white;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 1.5rem;
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
  padding: 1.5rem 3rem;
  margin: 1.5rem 2rem;
  border-radius: 12px;
  border: 2px solid #f5c6cb;
  text-align: center;
  font-weight: 500;
  font-size: 1.2rem;
}

.refresh-notification {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: rgba(0, 0, 0, 0.9);
  color: white;
  padding: 2rem 3rem;
  border-radius: 16px;
  z-index: 9999;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  animation: fadeIn 0.3s ease-in-out;
}

.refresh-content {
  display: flex;
  align-items: center;
  gap: 1.5rem;
}

.refresh-icon {
  font-size: 2.5rem;
  animation: spin 1s linear infinite;
}

.refresh-text {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.refresh-title {
  font-size: 1.5rem;
  font-weight: 600;
}

.refresh-subtitle {
  font-size: 1.1rem;
  opacity: 0.8;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translate(-50%, -50%) scale(0.9);
  }
  to {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1);
  }
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.dashboard-header,
.employees-section,
.recent-activity {
  border-radius: 20px;
  box-shadow: 0 6px 25px rgba(0, 0, 0, 0.1);
  margin: 0 0 3rem 0;
  width: 100%;
  padding-left: 3rem;
  padding-right: 3rem;
}

.dashboard-header {
  min-width: 0;
  background: rgba(255, 255, 255, 0.9);
  padding: 3rem;
  margin-bottom: 3rem;
  border-radius: 20px;
  box-shadow: 0 6px 25px rgba(0, 0, 0, 0.1);
}

.header-content {
  display: flex;
  align-items: center;
  gap: 6rem;
  flex-wrap: wrap;
}

.header-left {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.dashboard-header h1 {
  margin: 0;
  color: #2c3e50;
  font-size: 2.5rem;
  font-weight: 600;
  white-space: nowrap;
  display: flex;
  align-items: center;
  gap: 1rem;
}

.facility-name {
  color: #667eea;
  font-size: 2rem;
  font-weight: 500;
}

.current-time {
  text-align: left;
}

.time {
  font-size: 2.5rem;
  font-weight: 700;
  color: #667eea;
  margin-bottom: 0.8rem;
  white-space: nowrap;
}

.date {
  font-size: 1.3rem;
  color: #7f8c8d;
  white-space: nowrap;
}

.stats-overview {
  display: flex;
  gap: 3rem;
  flex-wrap: wrap;
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 2rem;
  background: rgba(255, 255, 255, 0.8);
  padding: 2rem;
  border-radius: 16px;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
  transition: transform 0.3s ease;
  min-width: 350px;
}

.stat-item:hover {
  transform: translateY(-3px);
}

.stat-icon {
  font-size: 3rem;
  flex-shrink: 0;
}

.stat-info {
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
  font-size: 1.8rem;
  color: #7f8c8d;
  white-space: nowrap;
}

/* 직원 리스트 섹션 */
.employees-section {
  min-width: 0;
  background: rgba(255, 255, 255, 0.9);
  padding: 3rem;
  margin-bottom: 3rem;
  border-radius: 20px;
  box-shadow: 0 6px 25px rgba(0, 0, 0, 0.1);
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2rem;
  flex-wrap: wrap;
  gap: 1.5rem;
}

.section-header h2 {
  margin: 0;
  color: #2c3e50;
  font-size: 1.8rem;
  font-weight: 600;
}

.header-controls {
  display: flex;
  gap: 1.5rem;
  flex-wrap: wrap;
  align-items: flex-end;
}

.time-settings {
  display: flex;
  gap: 1.5rem;
  flex-wrap: wrap;
}

.time-setting-item {
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
}

.time-setting-item label {
  font-size: 1.1rem;
  font-weight: 600;
  color: #2c3e50;
  white-space: nowrap;
}

.time-select {
  width: 140px;
  padding: 1rem;
  border: 3px solid #e0e0e0;
  border-radius: 12px;
  font-size: 1.2rem;
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
  padding: 0.8rem;
  border: 2px solid #e0e0e0;
  border-radius: 10px;
  font-size: 1.1rem;
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
  min-width: 400px;
}

.search-input {
  width: 100%;
  padding: 1rem 1rem 1rem 3rem;
  border: 3px solid #e0e0e0;
  border-radius: 12px;
  font-size: 1.2rem;
  background: white;
  transition: border-color 0.3s ease;
}

.search-input:focus {
  outline: none;
  border-color: #667eea;
}

.search-icon {
  position: absolute;
  left: 1rem;
  top: 50%;
  transform: translateY(-50%);
  color: #7f8c8d;
  font-size: 1.3rem;
}



.employees-table {
  width: 100%;
  overflow-x: auto;
}

.table-header {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr 1fr 1fr;
  gap: 1.5rem;
  padding: 1.5rem;
  background: #f8f9fa;
  border-radius: 12px;
  margin-bottom: 1rem;
  font-weight: 600;
  color: #2c3e50;
  font-size: 1.8rem;
}

.header-cell {
  padding: 1rem;
  text-align: left;
  font-size: 1.8rem;
}

.employee-rows {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.employee-row {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr 1fr 1fr;
  gap: 1.5rem;
  padding: 0.5rem 1.5rem;
  background: rgba(255, 255, 255, 0.8);
  border-radius: 12px;
  align-items: center;
  transition: all 0.3s ease;
  cursor: pointer;
}

.employee-row:hover {
  background: rgba(255, 255, 255, 1);
  transform: translateY(-3px);
  box-shadow: 0 6px 25px rgba(0, 0, 0, 0.15);
  border: 3px solid #667eea;
}

.cell {
  padding: 1rem;
  font-size: 1.8rem;
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
  padding: 0.8rem 1.5rem;
  border-radius: 30px;
  color: white;
  font-size: 1.5rem;
  font-weight: 600;
  text-align: center;
  white-space: nowrap;
  min-width: 100px;
  min-height: 45px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.attendance-btn {
  padding: 1rem 2rem;
  border: none;
  border-radius: 12px;
  font-size: 5.0rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
  white-space: nowrap;
  min-width: 120px;
  min-height: 55px;
  height: 100%;
}

.attendance-btn.check-in {
  background: #667eea;
  color: white;
}

.attendance-btn.check-in:hover:not(:disabled) {
  background: #5a6fd8;
  transform: translateY(-2px);
}

.attendance-btn.check-out {
  background: #e74c3c;
  color: white;
}

.attendance-btn.check-out:hover:not(:disabled) {
  background: #c0392b;
  transform: translateY(-2px);
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
  padding: 3rem;
  background: rgba(255, 255, 255, 0.8);
  border-radius: 12px;
  font-size: 1.5rem;
}

.recent-activity {
  min-width: 0;
  background: rgba(255, 255, 255, 0.9);
  padding: 3rem;
  border-radius: 20px;
  box-shadow: 0 6px 25px rgba(0, 0, 0, 0.1);
}

.recent-activity h2 {
  margin: 0 0 1.5rem 0;
  color: #2c3e50;
  font-size: 1.8rem;
}

.activity-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.no-records {
  text-align: center;
  color: #7f8c8d;
  font-style: italic;
  padding: 2rem;
  font-size: 1.2rem;
}

.activity-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1.5rem;
  background: rgba(255, 255, 255, 0.5);
  border-radius: 16px;
  border-left: 5px solid #667eea;
  flex-wrap: wrap;
  gap: 1rem;
}

.employee-info {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  min-width: 150px;
}

.employee-name {
  font-weight: 600;
  color: #2c3e50;
  white-space: nowrap;
  font-size: 1.8rem;
}

.employee-dept {
  font-size: 2rem;
  color: #7f8c8d;
  white-space: nowrap;
}

.attendance-info {
  display: flex;
  gap: 1rem;
  align-items: center;
  font-size: 1rem;
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
    font-size: 1.2rem;
  }

  .dashboard-header,
  .employees-section,
  .recent-activity {
    margin: 0 0 2rem 0;
    padding: 2rem;
  }

  .header-content {
    flex-direction: column;
    gap: 2rem;
    text-align: center;
  }

  .header-left {
    align-items: center;
  }

  .dashboard-header h1 {
    font-size: 2rem;
  }

  .time {
    font-size: 2rem;
  }

  .date {
    font-size: 1.1rem;
  }

  .stats-overview {
    justify-content: center;
    gap: 1.5rem;
  }

  .stat-item {
    min-width: 150px;
    padding: 1.5rem;
  }

  .stat-icon {
    font-size: 2.5rem;
  }

  .stat-number {
    font-size: 1.8rem;
  }

  .section-header {
    flex-direction: column;
    align-items: stretch;
  }

  .header-controls {
    flex-direction: column;
    gap: 1.5rem;
  }

  .time-settings {
    justify-content: center;
  }

  .time-setting-item {
    min-width: 140px;
  }

  .search-box {
    min-width: auto;
  }

  .table-header,
  .employee-row {
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
    margin-right: 1.5rem;
    font-size: 1.2rem;
  }

  .activity-item {
    flex-direction: column;
    align-items: flex-start;
    gap: 1rem;
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
    margin: 0 0 1.5rem 0;
    padding: 1.5rem;
  }

  .dashboard-header h1 {
    font-size: 1.8rem;
  }

  .time {
    font-size: 1.8rem;
  }

  .stats-overview {
    flex-direction: column;
    align-items: center;
  }

  .stat-item {
    width: 100%;
    max-width: 300px;
  }

  .table-header,
  .employee-row {
    grid-template-columns: 1fr;
  }

  .recent-activity h2 {
    font-size: 1.5rem;
  }
}

.employee-modal-overlay {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
}
.employee-modal {
  background: #fff;
  border-radius: 20px;
  padding: 3rem 2.5rem 2.5rem 2.5rem;
  min-width: 600px;
  max-width: 95vw;
  box-shadow: 0 10px 40px rgba(52, 152, 219, 0.15), 0 2px 10px rgba(44, 62, 80, 0.08);
  position: relative;
  animation: modalPop 0.25s cubic-bezier(.4,1.6,.6,1) both;
}
.employee-modal-content {
  display: flex;
  flex-direction: column;
  gap: 2rem;
}

@keyframes modalPop {
  0% { transform: scale(0.95) translateY(30px); opacity: 0; }
  100% { transform: scale(1) translateY(0); opacity: 1; }
}

.employee-modal h3 {
  margin-top: 0;
  margin-bottom: 2rem;
  font-size: 1.8rem;
  color: #2980b9;
  font-weight: 700;
  letter-spacing: 1px;
  text-align: center;
}

.employee-modal .close-btn {
  position: absolute;
  top: 1.5rem;
  right: 1.5rem;
  background: none;
  border: none;
  font-size: 2rem;
  color: #aaa;
  cursor: pointer;
  transition: color 0.2s;
}
.employee-modal .close-btn:hover {
  color: #e74c3c;
}

.employee-modal .info-section {
  background: #f8f9fa;
  border-radius: 12px;
  padding: 1.5rem 1.2rem;
  margin-bottom: 1.5rem;
  box-shadow: 0 2px 6px rgba(52, 152, 219, 0.05);
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
}

.employee-modal .info-label {
  font-weight: 600;
  color: #7f8c8d;
  min-width: 120px;
  display: inline-block;
  font-size: 1.1rem;
}

.employee-modal .info-value {
  font-weight: 600;
  color: #2c3e50;
  font-size: 1.2rem;
}

.employee-modal .input-section {
  background: #f4f8fb;
  border-radius: 12px;
  padding: 0rem 1.2rem;
  box-shadow: 0 2px 6px rgba(52, 152, 219, 0.04);
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.employee-modal select {
  padding: 1rem 1.2rem;
  border-radius: 10px;
  border: 2px solid #d0d7de;
  font-size: 1.2rem;
  background: #fff;
  transition: border-color 0.2s;
}
.employee-modal select:focus {
  border-color: #2980b9;
  outline: none;
}

.employee-modal .modal-btn-row {
  display: flex;
  gap: 1.5rem;
  justify-content: center;
  margin-top: 2rem;
}

.employee-modal .attendance-btn {
  padding: 1rem 2.5rem;
  border-radius: 10px;
  font-size: 3.0rem;
  font-weight: 700;
  border: none;
  cursor: pointer;
  background: #3498db;
  color: #fff;
  transition: background 0.2s, transform 0.1s;
  box-shadow: 0 3px 10px rgba(52, 152, 219, 0.08);
  min-height: 60px;
}
.employee-modal .attendance-btn:disabled {
  background: #b2bec3;
  cursor: not-allowed;
}
.employee-modal .attendance-btn:hover:not(:disabled) {
  background: #2980b9;
  transform: translateY(-3px) scale(1.03);
}

.input-section-title {
  font-size: 1.3rem;
  font-weight: 700;
  color: #2980b9;
  text-align: left;
  letter-spacing: 1px;
}
.full-width-select {
  width: 100%;
  box-sizing: border-box;
}

.modal-main-section {
  display: flex;
  gap: 3rem;
  align-items: stretch;
  flex: 1;
  min-height: 350px;
}

.modal-left-section {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.modal-right-section {
  width: 250px;
  flex-shrink: 0;
  display: flex;
  align-items: stretch;
}

.action-buttons {
  display: flex;
  flex-direction: column;
  gap: 2rem;
  width: 100%;
  justify-content: center;
}

.check-in-btn {
  background: #27ae60 !important;
  color: white;
  padding: 2rem 1.5rem;
  border-radius: 15px;
  font-size: 1.6rem;
  font-weight: 700;
  border: none;
  cursor: pointer;
  transition: all 0.3s ease;
  min-height: 120px;
  width: 100%;
  box-shadow: 0 4px 15px rgba(39, 174, 96, 0.3);
}

.check-in-btn:hover:not(:disabled) {
  background: #229954 !important;
  transform: translateY(-5px);
  box-shadow: 0 8px 25px rgba(39, 174, 96, 0.4);
}

.check-in-btn:disabled {
  background: #95a5a6 !important;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

.check-out-btn {
  background: #e74c3c !important;
  color: white;
  padding: 2rem 1.5rem;
  border-radius: 15px;
  font-size: 1.6rem;
  font-weight: 700;
  border: none;
  cursor: pointer;
  transition: all 0.3s ease;
  min-height: 120px;
  width: 100%;
  box-shadow: 0 4px 15px rgba(231, 76, 60, 0.3);
}

.check-out-btn:hover:not(:disabled) {
  background: #c0392b !important;
  transform: translateY(-5px);
  box-shadow: 0 8px 25px rgba(231, 76, 60, 0.4);
}

.check-out-btn:disabled {
  background: #95a5a6 !important;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

.input-section {
  background: #f4f8fb;
  border-radius: 12px;
  padding: 2rem 1.5rem;
  margin-bottom: 1.5rem;
  box-shadow: 0 2px 6px rgba(52, 152, 219, 0.04);
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  flex: 1;
  justify-content: center;
}

.input-section-title {
  font-size: 1.4rem;
  font-weight: 700;
  color: #2980b9;
  text-align: left;
  letter-spacing: 1px;
  margin-bottom: 1rem;
}

.employee-modal select {
  padding: 1rem 1.2rem;
  border-radius: 10px;
  border: 2px solid #d0d7de;
  font-size: 1.2rem;
  background: #fff;
  transition: border-color 0.2s;
}

.employee-header {
  border-bottom: 2px solid #ecf0f1;
  padding-bottom: 1.5rem;
}

.employee-basic-info {
  display: flex;
  align-items: center;
  gap: 2rem;
}

.employee-code {
  font-size: 1.4rem;
  font-weight: 600;
  color: #2c3e50;
  background: #f8f9fa;
  padding: 0.8rem 1.5rem;
  border-radius: 8px;
  border: 2px solid #e0e0e0;
}

.employee-name {
  font-size: 1.8rem;
  font-weight: 700;
  color: #2c3e50;
}

.shift-type-buttons {
  display: flex;
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.shift-type-btn {
  flex: 1;
  padding: 1rem 1.5rem;
  border: none;
  border-radius: 12px;
  font-size: 1.4rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.3s ease;
  min-height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.day-shift-btn {
  background: #3498db;
  color: white;
  box-shadow: 0 4px 15px rgba(52, 152, 219, 0.3);
}

.day-shift-btn:hover:not(:disabled) {
  background: #2980b9;
  transform: translateY(-3px);
  box-shadow: 0 8px 25px rgba(52, 152, 219, 0.4);
}

.day-shift-btn:disabled {
  background: #b2bec3;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

.night-shift-btn {
  background: #2c3e50;
  color: white;
  box-shadow: 0 4px 15px rgba(44, 62, 80, 0.3);
}

.night-shift-btn:hover:not(:disabled) {
  background: #34495e;
  transform: translateY(-3px);
  box-shadow: 0 8px 25px rgba(44, 62, 80, 0.4);
}

.night-shift-btn:disabled {
  background: #b2bec3;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}
</style>

