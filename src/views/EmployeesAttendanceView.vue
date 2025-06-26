<script setup lang="ts">
import { useSupabaseAttendanceStore } from '../stores/supabaseAttendance'
import { ref, computed, onMounted } from 'vue'
import type { AttendanceRecord } from '../lib/supabase'
import { useRoute } from 'vue-router'

const store = useSupabaseAttendanceStore()
const route = useRoute()

// 날짜 선택
const getDefaultStartDate = () => {
  const today = new Date()
  const currentMonth = today.getMonth()
  const currentYear = today.getFullYear()
  
  // 이전 달 21일부터
  const lastMonth = currentMonth === 0 ? 11 : currentMonth - 1
  const lastYear = currentMonth === 0 ? currentYear - 1 : currentYear
  return new Date(lastYear, lastMonth, 22).toISOString().split('T')[0]
}

const getDefaultEndDate = () => {
  const today = new Date()
  const currentMonth = today.getMonth()
  const currentYear = today.getFullYear()
  
  // 현재 달 20일까지
  return new Date(currentYear, currentMonth, 21).toISOString().split('T')[0]
}

const startDate = ref(getDefaultStartDate())
const endDate = ref(getDefaultEndDate())

// 선택된 직원
const selectedEmployeeId = ref('')

// 로딩 상태
const loading = ref(false)

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
    await store.initialize()
    // 현재 연도의 공휴일 가져오기
    const currentYear = new Date().getFullYear()
    await fetchHolidays(currentYear)
    
    // 쿼리 파라미터에서 직원 ID 확인
    const employeeIdFromQuery = route.query.employeeId as string
    if (employeeIdFromQuery) {
      selectedEmployeeId.value = employeeIdFromQuery
    }
  } catch (error) {
    console.error('페이지 초기화 중 에러 발생:', error)
    loading.value = false
  }
})

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

// 휴일 여부 확인 (주말 + 공휴일)
const isHoliday = (dateString: string) => {
  const date = new Date(dateString)
  const isWeekend = date.getDay() === 0 // 일요일(0) 또는 토요일(6)
  const isPublicHoliday = holidays.value.includes(dateString)
  
  return isWeekend || isPublicHoliday
}

// 공휴일 여부 확인
const isPublicHoliday = (dateString: string) => {
  return holidays.value.includes(dateString)
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

// 근무시간 계산 함수 (출퇴근 시간 기반)
const calculateWorkHours = (checkInTime: string | null, checkOutTime: string | null) => {
  if (!checkInTime || !checkOutTime) return 0
  
  // 30분 단위로 반올림된 시간으로 계산
  const checkInMinutes = getMinutesFromTime(checkInTime)
  const checkOutMinutes = getMinutesFromTime(checkOutTime)
  
  // 퇴근시간이 출근시간보다 작으면 다음날로 간주 (야간근무)
  let workMinutes = checkOutMinutes - checkInMinutes
  if (workMinutes <= 0) {
    workMinutes += 24 * 60 // 24시간 추가
  }
  
  return workMinutes / 60
}

// 휴식시간을 제외한 근무시간 계산 함수
const calculateNetWorkHours = (checkInTime: string | null, checkOutTime: string | null, breakTime: string | null, isHoliday: boolean = false) => {
  if (!checkInTime || !checkOutTime) return 0
  
  const totalWorkHours = calculateWorkHours(checkInTime, checkOutTime)
  
  // 휴식시간 계산 (분 단위)
  const getBreakTimeMinutes = (breakTimeStr: string | null) => {
    if (!breakTimeStr) return 0
    const [hours, minutes] = breakTimeStr.split(':').map(Number)
    return hours * 60 + minutes
  }
  
  const breakTimeMinutes = getBreakTimeMinutes(breakTime)
  const breakTimeHours = breakTimeMinutes / 60
  
  // 총 근무시간에서 휴식시간 제외
  const netWorkHours = totalWorkHours - breakTimeHours
  
  // 휴일에 야간근무가 아닌 사람이 8시간 이상 근무한 경우 8시간으로 고정
  if (isHoliday && !isNightShiftWork(checkInTime, checkOutTime) && netWorkHours >= 8) {
    return 8
  }
  
  return Math.max(0, netWorkHours) // 음수가 되지 않도록
}

// 근무 통계 계산
const workStats = computed(() => {
  const records = selectedPeriodRecords.value
  let holidayWorkHours = 0
  let holidayExcludedHours = 0
  let weekdayWorkHours = 0
  let earlyShiftHours = 0
  let lateShiftHours = 0
  let dayShiftHours = 0
  let workDays = 0
  let holidayDays = 0
  let nightShiftCount = 0 // 야근근무 횟수

  records.forEach(record => {
    if (record.check_in && record.check_out) {
      const isHolidayWork = isHoliday(record.date)
      
      // 야근근무 여부 확인 (16:30 ~ 다음날 09:30)
      const isNightShift = isNightShiftWork(record.check_in, record.check_out, record.scheduled_check_in, record.scheduled_check_out)
      if (isNightShift) {
        nightShiftCount++
      }
      
      // 실제 출퇴근 시간으로 근무시간 계산
      const actualWorkHours = calculateWorkHours(record.check_in, record.check_out)
      
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
      workDays++
      
      if (isHolidayWork) {
        // 야간근무가 아닌 경우 9:00~18:00 사이의 근무만 휴일출근시간으로 인정
        if (!record.is_night_shift) {
          const checkInTime = record.check_in
          const checkOutTime = record.check_out
          
          // 30분 단위로 반올림된 시간으로 계산
          const checkInMinutes = getMinutesFromTime(checkInTime)
          const checkOutMinutes = getMinutesFromTime(checkOutTime)
          
          // 9:00 (540분) ~ 18:00 (1080분) 사이의 근무시간 계산
          const workStartMinutes = Math.max(checkInMinutes, 540) // 9:00
          const workEndMinutes = Math.min(checkOutMinutes, 1080) // 18:00
          
          if (workStartMinutes < workEndMinutes) {
            const recognizedWorkMinutes = workEndMinutes - workStartMinutes
            const recognizedWorkHours = recognizedWorkMinutes / 60
            
            // 휴일출근시간에서 휴게시간 제외
            const adjustedHolidayHours = recognizedWorkHours - breakTimeHoursForRecord
            
            console.log('인정 근무시간:', recognizedWorkHours, '시간')
            console.log('휴게시간:', breakTimeHoursForRecord, '시간')
            console.log('조정된 휴일출근시간:', adjustedHolidayHours, '시간')
            
            holidayWorkHours += Math.max(0, adjustedHolidayHours) // 음수가 되지 않도록
            
            // 제외된 시간 계산 (전체 근무시간 - 인정된 근무시간)
            const excludedHours = netWorkHours - Math.max(0, adjustedHolidayHours)
            holidayExcludedHours += Math.max(0, excludedHours)
          } else {
            // 9:00~18:00 외 시간이므로 모두 제외
            holidayExcludedHours += netWorkHours
          }
        } else {
          // 야간근무는 전체 시간에서 휴식시간 제외
          holidayWorkHours += netWorkHours
        }
        holidayDays++
      } else {
        // 평일 근무시간 (휴일이 아닌 경우)
        weekdayWorkHours += netWorkHours
      }
      
      // 근무 유형별 시간 계산
      const shiftHours = calculateShiftHours(record.check_in, record.check_out, record.break_time, isHoliday(record.date), record.scheduled_check_in, record.scheduled_check_out)
      earlyShiftHours += shiftHours.early
      lateShiftHours += shiftHours.late
      dayShiftHours += shiftHours.day
    }
  })

  // 총 근무시간을 분류된 시간들의 합계로 계산
  const totalWorkHours = earlyShiftHours + lateShiftHours + dayShiftHours + holidayWorkHours

  return {
    totalWorkHours: Math.round(totalWorkHours * 100) / 100,
    holidayWorkHours: Math.round(holidayWorkHours * 100) / 100,
    holidayExcludedHours: Math.round(holidayExcludedHours * 100) / 100,
    weekdayWorkHours: Math.round(weekdayWorkHours * 100) / 100,
    earlyShiftHours: Math.round(earlyShiftHours * 100) / 100,
    lateShiftHours: Math.round(lateShiftHours * 100) / 100,
    dayShiftHours: Math.round(dayShiftHours * 100) / 100,
    workDays,
    holidayDays,
    totalDays: workDays + holidayDays,
    nightShiftCount // 야근근무 횟수 추가
  }
})

// 근무 유형별 시간 계산 함수
const calculateShiftHours = (checkInTime: string | null, checkOutTime: string | null, breakTime: string | null, isHoliday: boolean = false, scheduledCheckIn: string | null = null, scheduledCheckOut: string | null = null) => {
  if (!checkInTime || !checkOutTime) return { early: 0, late: 0, day: 0 }
  
  // 30분 단위로 반올림된 시간으로 계산
  const checkInMinutes = getMinutesFromTime(checkInTime)
  const checkOutMinutes = getMinutesFromTime(checkOutTime)
  
  // 야간근무 여부 확인 (16:30 ~ 다음날 09:30) - 예상 출퇴근시간 기준
  const isNightShift = isNightShiftWork(checkInTime, checkOutTime, scheduledCheckIn, scheduledCheckOut)
  
  // 야간근무인 경우 早出, 遅出, 日勤 계산하지 않음
  if (isNightShift) {
    return { early: 0, late: 0, day: 0 }
  }
  
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
    
    // 遅出이 日勤보다 우선순위가 높도록 순서 변경
    if (minuteInDay >= lateStart && minuteInDay < lateEnd) {
      // 遅出 시간대 (18:00~20:00)
      lateShiftMinutes += segmentMinutes
    } else if (minuteInDay >= earlyStart && minuteInDay < earlyEnd) {
      // 早出 시간대 (07:00~09:00)
      earlyShiftMinutes += segmentMinutes
    } else if (minuteInDay >= dayStart && minuteInDay < dayEnd) {
      // 日勤 시간대 (09:00~18:00)
      dayShiftMinutes += segmentMinutes
    }
    
    currentMinute = nextMinute
  }
  
  // 휴식시간을 日勤에서만 차감
  if (dayShiftMinutes > 0 && breakTimeMinutes > 0) {
    dayShiftMinutes -= breakTimeMinutes
  }
  
  // 휴일에 야간근무가 아닌 사람이 8시간 이상 근무한 경우 日勤을 8시간으로 고정
  if (isHoliday && !isNightShift) {
    const totalWorkHours = (earlyShiftMinutes + lateShiftMinutes + dayShiftMinutes) / 60
    if (totalWorkHours >= 8) {
      dayShiftMinutes = 8 * 60 // 8시간을 분으로 변환
      earlyShiftMinutes = 0
      lateShiftMinutes = 0
    }
  }
  
  return {
    early: Math.max(0, earlyShiftMinutes / 60),
    late: Math.max(0, lateShiftMinutes / 60),
    day: Math.max(0, dayShiftMinutes / 60)
  }
}

// 야근근무 여부 확인 (16:30 ~ 다음날 09:30)
const isNightShiftWork = (checkInTime: string | null, checkOutTime: string | null, scheduledCheckIn: string | null = null, scheduledCheckOut: string | null = null) => {
  if (!checkInTime || !checkOutTime) return false
  
  // 예상 출퇴근시간이 있으면 그것을 기준으로, 없으면 실제 출퇴근시간을 기준으로
  const baseCheckIn = scheduledCheckIn || checkInTime
  const baseCheckOut = scheduledCheckOut || checkOutTime
  
  // 30분 단위로 반올림된 시간으로 계산
  const checkInMinutes = getMinutesFromTime(baseCheckIn)
  const checkOutMinutes = getMinutesFromTime(baseCheckOut)
  
  // 16:30 = 990분, 09:30 = 570분
  const nightShiftStart = 990 // 16:30
  const nightShiftEnd = 570   // 09:30
  
  // 퇴근시간이 출근시간보다 작으면 다음날로 간주
  if (checkOutMinutes <= checkInMinutes) {
    // 야근근무 조건: 출근시간이 16:30 이후이고, 퇴근시간이 다음날 09:30 이전
    return checkInMinutes >= nightShiftStart && checkOutMinutes <= nightShiftEnd
  }
  
  return false
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
  
  // 30분 단위로 반올림하여 표시
  return roundToNearestHalfHour(timeString)
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

// 출근 시간 차이 확인 (30분 이상 차이나면 true)
const isCheckInTimeDifferent = (record: AttendanceRecord) => {
  const diff = getTimeDifference(record.scheduled_check_in, record.check_in)
  return diff >= 30
}

// 퇴근 시간 차이 확인 (30분 이상 차이나면 true)
const isCheckOutTimeDifferent = (record: AttendanceRecord) => {
  const diff = getTimeDifference(record.scheduled_check_out, record.check_out)
  return diff >= 30
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

    <!-- 직원 선택 및 기간 설정 -->
    <div class="control-section">
      <div class="employee-selector">
        <label for="employee-select">従業員選択:</label>
        <select 
          id="employee-select" 
          v-model="selectedEmployeeId"
          class="employee-select"
        >
          <option value="">従業員を選択してください</option>
          <option 
            v-for="employee in store.activeEmployees" 
            :key="employee.id" 
            :value="employee.id"
          >
            {{ employee.employee_code }} - {{ employee.last_name }}{{ employee.first_name }} ({{ employee.department }})
          </option>
        </select>
      </div>

      <div class="date-range-selector">
        <div class="date-input">
          <label for="start-date">開始日:</label>
          <input 
            id="start-date" 
            type="date" 
            v-model="startDate"
            class="date-input-field"
          />
        </div>
        <div class="date-input">
          <label for="end-date">終了日:</label>
          <input 
            id="end-date" 
            type="date" 
            v-model="endDate"
            class="date-input-field"
          />
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
          <span class="value">{{ selectedEmployee.department }}</span>
        </div>
        <div class="detail-item">
          <span class="label">職種:</span>
          <span class="value">{{ selectedEmployee.category_1 }}</span>
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
      <div class="shift-stats">
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
          </div>
        </div>
          <div class="stat-card shift-card">
            <div class="stat-icon">🌙</div>
            <div class="stat-content">
              <div class="stat-number">{{ workStats.nightShiftCount }}回</div>
              <div class="stat-label">夜勤勤務回数</div>
              <div class="stat-subtitle">16:30～翌日09:30</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 상세 근무 기록 -->
    <div v-if="selectedEmployee" class="work-records">
      <h2>詳細勤務記録</h2>
      <div v-if="selectedPeriodRecords.length === 0" class="no-records">
        選択された期間の勤務記録がありません。
      </div>
      <div v-else class="records-table">
        <div class="table-header">
          <div class="header-cell">日付</div>
          <div class="header-cell">予想出勤</div>
          <div class="header-cell">予想退勤</div>
          <div class="header-cell">休憩時間</div>
          <div class="header-cell">出勤時間</div>
          <div class="header-cell">退勤時間</div>
          <div class="header-cell">早出</div>
          <div class="header-cell">遅出</div>
          <div class="header-cell">日勤</div>
          <div class="header-cell">勤務時間</div>
          <div class="header-cell">状態</div>
        </div>
        
        <div class="table-body">
          <div 
            v-for="record in selectedPeriodRecords" 
            :key="record.id" 
            class="record-row"
            :class="{ 
              timeDifference: isCheckInTimeDifferent(record) || isCheckOutTimeDifferent(record)
            }"
          >
            <div class="cell date-cell">{{ formatDate(record.date) }}</div>
            <div class="cell expected-checkin">{{ formatTime(record.scheduled_check_in) }}</div>
            <div class="cell expected-checkout">{{ formatTime(record.scheduled_check_out) }}</div>
            <div class="cell break-time-cell">{{ formatTime(record.break_time) }}</div>
            <div class="cell checkin-cell">
              <div :class="{ 'time-display': !getCheckInDifferenceText(record), 'time-difference': getCheckInDifferenceText(record) }">{{ formatTime(record.check_in) }}</div>
            </div>
            <div class="cell checkout-cell">
              <div :class="{ 'time-display': !getCheckOutDifferenceText(record), 'time-difference': getCheckOutDifferenceText(record) }">{{ formatTime(record.check_out) }}</div>
            </div>
            <div class="cell shift-hours-cell">
              {{ (() => { const hours = calculateShiftHours(record.check_in, record.check_out, record.break_time, isHoliday(record.date), record.scheduled_check_in, record.scheduled_check_out); return hours.early > 0 ? `${hours.early.toFixed(1)}時間` : '-'; })() }}
            </div>
            <div class="cell shift-hours-cell">
              {{ (() => { const hours = calculateShiftHours(record.check_in, record.check_out, record.break_time, isHoliday(record.date), record.scheduled_check_in, record.scheduled_check_out); return hours.late > 0 ? `${hours.late.toFixed(1)}時間` : '-'; })() }}
            </div>
            <div class="cell shift-hours-cell">
              {{ (() => { const hours = calculateShiftHours(record.check_in, record.check_out, record.break_time, isHoliday(record.date), record.scheduled_check_in, record.scheduled_check_out); return hours.day > 0 ? `${hours.day.toFixed(1)}時間` : '-'; })() }}
            </div>
            <div class="cell hours-cell">
              {{ record.check_in && record.check_out ? `${calculateNetWorkHours(record.check_in, record.check_out, record.break_time, isHoliday(record.date)).toFixed(1)}時間` : '-' }}
            </div>
            <div class="cell status-cell">
              <span 
                class="status-badge"
                :style="{ backgroundColor: getWorkStatusColor(record) }"
              >
                {{ getWorkStatusText(record) }}
              </span>
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
  padding: 2rem;
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

.loading-spinner {
  width: 50px;
  height: 50px;
  border: 4px solid rgba(255, 255, 255, 0.3);
  border-top: 4px solid white;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 1rem;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.error-message {
  background: #f8d7da;
  color: #721c24;
  padding: 1rem 2rem;
  margin: 1rem 0;
  border-radius: 8px;
  border: 1px solid #f5c6cb;
  text-align: center;
  font-weight: 500;
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

.current-time {
  font-size: 1.2rem;
  color: #7f8c8d;
  font-weight: 500;
}

.control-section {
  background: rgba(255, 255, 255, 0.9);
  padding: 2rem;
  border-radius: 16px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
  margin-bottom: 2rem;
  display: flex;
  gap: 2rem;
  flex-wrap: wrap;
  align-items: flex-end;
}

.employee-selector {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  min-width: 300px;
}

.employee-selector label {
  font-weight: 600;
  color: #2c3e50;
}

.employee-select {
  padding: 0.75rem;
  border: 2px solid #e0e0e0;
  border-radius: 8px;
  font-size: 1rem;
  background: white;
  transition: border-color 0.3s ease;
}

.employee-select:focus {
  outline: none;
  border-color: #667eea;
}

.date-range-selector {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
}

.date-input {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.date-input label {
  font-weight: 600;
  color: #2c3e50;
  white-space: nowrap;
}

.date-input-field {
  padding: 0.75rem;
  border: 2px solid #e0e0e0;
  border-radius: 8px;
  font-size: 1rem;
  background: white;
  transition: border-color 0.3s ease;
}

.date-input-field:focus {
  outline: none;
  border-color: #667eea;
}

.employee-info {
  background: rgba(255, 255, 255, 0.9);
  padding: 2rem;
  border-radius: 16px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
  margin-bottom: 2rem;
}

.employee-info h2 {
  margin: 0 0 1rem 0;
  color: #2c3e50;
  font-size: 1.5rem;
}

.employee-details {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem;
}

.detail-item {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.detail-item .label {
  font-size: 0.9rem;
  color: #7f8c8d;
  font-weight: 500;
}

.detail-item .value {
  font-size: 1.1rem;
  color: #2c3e50;
  font-weight: 600;
}

.work-stats {
  background: rgba(255, 255, 255, 0.9);
  padding: 2rem;
  border-radius: 16px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
  margin-bottom: 2rem;
}

.work-stats h2 {
  margin: 0 0 1.5rem 0;
  color: #2c3e50;
  font-size: 1.5rem;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1.5rem;
}

.stat-card {
  display: flex;
  align-items: center;
  gap: 1rem;
  background: rgba(255, 255, 255, 0.8);
  padding: 1.5rem;
  border-radius: 12px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
  transition: transform 0.3s ease;
}

.stat-card:hover {
  transform: translateY(-2px);
}

.stat-icon {
  font-size: 2rem;
  flex-shrink: 0;
}

.stat-content {
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
  font-size: 0.9rem;
  color: #7f8c8d;
  margin-top: 0.25rem;
}

.stat-excluded {
  font-size: 0.75rem;
  color: #e74c3c;
  margin-top: 0.25rem;
  font-style: italic;
  opacity: 0.8;
}

.stat-tip {
  font-size: 0.75rem;
  color: #e74c3c;
  margin-top: 0.25rem;
  font-style: italic;
  opacity: 0.8;
}

.work-records {
  background: rgba(255, 255, 255, 0.9);
  padding: 2rem;
  border-radius: 16px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
}

.work-records h2 {
  margin: 0 0 1.5rem 0;
  color: #2c3e50;
  font-size: 1.5rem;
}

.no-records {
  text-align: center;
  color: #7f8c8d;
  font-style: italic;
  padding: 3rem;
  background: rgba(255, 255, 255, 0.5);
  border-radius: 8px;
}

.records-table {
  width: 100%;
  overflow-x: auto;
}

.table-header {
  display: grid;
  grid-template-columns: 1.1fr 0.8fr 0.8fr 0.8fr 0.8fr 1fr 1fr 1fr 1fr 1fr 1fr;
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

.table-body {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.record-row {
  display: grid;
  grid-template-columns: 1.1fr 0.8fr 0.8fr 0.8fr 0.8fr 1fr 1fr 1fr 1fr 1fr 1fr;
  gap: 1rem;
  padding: 1rem;
  background: rgba(255, 255, 255, 0.8);
  border-radius: 8px;
  align-items: center;
  transition: all 0.3s ease;
}

.record-row:hover {
  background: rgba(255, 255, 255, 1);
  transform: translateY(-1px);
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
}

.record-row.holiday {
  background: rgba(255, 248, 220, 0.8);
  border-left: 4px solid #f39c12;
}

.record-row.holiday:hover {
  background: rgba(255, 248, 220, 1);
}

.record-row.publicHoliday {
  background: rgba(255, 235, 235, 0.8);
  border-left: 4px solid #e74c3c;
}

.record-row.publicHoliday:hover {
  background: rgba(255, 235, 235, 1);
}

.record-row.timeDifference {
  background: rgba(231, 76, 60, 0.1);
  border-left: 4px solid #e74c3c;
}

.record-row.timeDifference:hover {
  background: rgba(231, 76, 60, 0.15);
}

.cell {
  padding: 0.5rem;
  font-size: 0.9rem;
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
  padding: 0.25rem 1.0rem;
  border-radius: 12px;
  font-size: 0.75rem;
  font-weight: 600;
  color: white;
  background: #e74c3c;
  white-space: nowrap;
}

.expected-checkin,
.expected-checkout {
  color: #7f8c8d;
  font-family: monospace;
}

.break-time-cell,
.checkin-cell,
.checkout-cell {
  color: #2c3e50;
  font-family: monospace;
  font-weight: 500;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.time-display {
  font-size: 0.9rem;
}

.time-difference {
  color: #e74c3c;
  font-weight: 600;
  padding: 0.1rem 0.3rem;
  border-radius: 4px;
  white-space: nowrap;
}

.hours-cell {
  color: #2c3e50;
  font-weight: 600;
}

.status-badge {
  padding: 0.5rem 1rem;
  border-radius: 25px;
  color: white;
  font-size: 0.8rem;
  font-weight: 600;
  text-align: center;
  white-space: nowrap;
  min-width: 60px;
  display: inline-block;
}

.work-type-cell {
  text-align: center;
}

.work-type-badge {
  padding: 0.25rem 1rem;
  border-radius: 12px;
  font-size: 0.75rem;
  font-weight: 600;
  color: white;
  background: #3498db;
  white-space: nowrap;
}

.shift-stats {
  margin-top: 2rem;
  padding-top: 2rem;
  border-top: 2px solid #ecf0f1;
}

.shift-stats h3 {
  margin: 0 0 1.5rem 0;
  color: #2c3e50;
  font-size: 1.3rem;
  font-weight: 600;
}

.shift-card {
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.9), rgba(255, 255, 255, 0.7));
  border: 2px solid #ecf0f1;
}

.shift-card:hover {
  border-color: #3498db;
  transform: translateY(-3px);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.15);
}

.stat-subtitle {
  font-size: 0.7rem;
  color: #95a5a6;
  margin-top: 0.1rem;
  font-weight: 500;
}

.shift-hours-cell {
  font-weight: 600;
  color: #2c3e50;
  font-family: monospace;
  font-size: 0.85rem;
}

.salary-section {
  margin-top: 2rem;
  padding-top: 2rem;
  border-top: 2px solid #ecf0f1;
}

.salary-section h3 {
  margin: 0 0 1.5rem 0;
  color: #2c3e50;
  font-size: 1.3rem;
  font-weight: 600;
}

.hourly-rates {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
}

.rate-input {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.rate-input label {
  font-weight: 600;
  color: #2c3e50;
}

.rate-input-field {
  padding: 0.75rem;
  border: 2px solid #e0e0e0;
  border-radius: 8px;
  font-size: 1rem;
  background: white;
  transition: border-color 0.3s ease;
}

.rate-input-field:focus {
  outline: none;
  border-color: #667eea;
}

.currency {
  font-size: 0.8rem;
  color: #7f8c8d;
  font-weight: 500;
}

.rate-display-section {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem;
  margin-top: 1rem;
  padding: 1rem;
  background: rgba(255, 255, 255, 0.5);
  border-radius: 8px;
  border: 1px solid #ecf0f1;
}

.rate-display-item {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 0.75rem;
  background: rgba(255, 255, 255, 0.8);
  border-radius: 6px;
  border: 1px solid #ecf0f1;
}

.rate-label {
  font-size: 0.9rem;
  font-weight: 600;
  color: #2c3e50;
}

.rate-value {
  font-size: 1.1rem;
  font-weight: 700;
  color: #2c3e50;
}

.rate-note {
  font-size: 0.75rem;
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
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1.5rem;
  margin-top: 1.5rem;
}

.salary-card {
  display: flex;
  align-items: center;
  gap: 1rem;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.9), rgba(255, 255, 255, 0.7));
  padding: 1.5rem;
  border-radius: 12px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
  transition: transform 0.3s ease;
  border: 2px solid #ecf0f1;
}

.salary-card:hover {
  transform: translateY(-2px);
  border-color: #3498db;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.15);
}

.salary-icon {
  font-size: 2rem;
  flex-shrink: 0;
}

.salary-content {
  display: flex;
  flex-direction: column;
  flex: 1;
}

.salary-number {
  font-size: 1.5rem;
  font-weight: 700;
  color: #2c3e50;
  line-height: 1;
}

.salary-label {
  font-size: 0.9rem;
  color: #7f8c8d;
  margin-top: 0.25rem;
}

.salary-detail {
  font-size: 0.75rem;
  color: #95a5a6;
  margin-top: 0.25rem;
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

@media (max-width: 768px) {
  .employees-info-page {
    padding: 1rem;
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

  .control-section {
    flex-direction: column;
    gap: 1rem;
    padding: 1.5rem;
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
}
</style> 