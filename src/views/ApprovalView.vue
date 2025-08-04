<script setup lang="ts">
import { useAuthStore } from '../stores/auth'
import { ref, computed, onMounted } from 'vue'

const authStore = useAuthStore()

// 승인 요청 목록
const approvalRequests = ref<{
  id: string
  requested_date: string
  request_type: string
  requested_check_in: string | null
  requested_check_out: string | null
  requested_scheduled_check_in: string | null
  requested_scheduled_check_out: string | null
  requested_break_time: string | null
  reason: string
  status: string
  created_at: string
  employees?: {
    last_name: string
    first_name: string
    employee_code: string
    department: string
  }
}[]>([])
const loading = ref(false)
const processingRequest = ref<string | null>(null)

// 필터링
const statusFilter = ref('pending')
const requestTypeFilter = ref('all')

// 페이지네이션
const currentPage = ref(1)
const itemsPerPage = 10

// 승인 요청 목록 로드
const loadApprovalRequests = async () => {
  loading.value = true
  
  try {
    const { supabase } = await import('../lib/supabase')
    
    let query = supabase
      .from('attendance_change_requests')
      .select(`
        *,
        attendance_records (*),
        employees (*)
      `)
      .order('created_at', { ascending: false })
    
    // 상태 필터 적용
    if (statusFilter.value !== 'all') {
      query = query.eq('status', statusFilter.value)
    }
    
    const { data, error } = await query
    
    if (error) {
      throw error
    }
    
    approvalRequests.value = data || []
  } catch (error) {
    console.error('승인 요청 목록 로드 중 오류 발생:', error)
  } finally {
    loading.value = false
  }
}

// 필터링된 요청 목록
const filteredRequests = computed(() => {
  let filtered = approvalRequests.value
  
  // 요청 타입 필터 적용
  if (requestTypeFilter.value !== 'all') {
    filtered = filtered.filter(request => request.request_type === requestTypeFilter.value)
  }
  
  return filtered
})

// 페이지네이션된 요청 목록
const paginatedRequests = computed(() => {
  const start = (currentPage.value - 1) * itemsPerPage
  const end = start + itemsPerPage
  return filteredRequests.value.slice(start, end)
})

// 총 페이지 수
const totalPages = computed(() => {
  return Math.ceil(filteredRequests.value.length / itemsPerPage)
})

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

// 날짜 포맷팅
const formatDate = (dateString: string) => {
  if (!dateString) return '-'
  const date = new Date(dateString)
  return date.toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long'
  })
}

// 시간 포맷팅
const formatTime = (timeString: string | null) => {
  if (!timeString) return '-'
  return timeString.slice(0, 5) // HH:MM 형식
}

// 날짜시간 포맷팅
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

// 요청 승인
const approveRequest = async (requestId: string) => {
  processingRequest.value = requestId
  
  try {
    const { supabase } = await import('../lib/supabase')
    
    // 승인할 요청 정보 가져오기
    const { data: requestData, error: fetchError } = await supabase
      .from('attendance_change_requests')
      .select('*')
      .eq('id', requestId)
      .single()
    
    if (fetchError) {
      throw fetchError
    }
    
    if (!requestData) {
      throw new Error('요청을 찾을 수 없습니다.')
    }
    
    // 요청 상태를 승인으로 업데이트
    const { error: updateError } = await supabase
      .from('attendance_change_requests')
      .update({ status: 'approved' })
      .eq('id', requestId)
    
    if (updateError) {
      throw updateError
    }
    
    // attendance_records 업데이트
    if (requestData.attendance_record_id) {
      if (requestData.request_type === 'cancel') {
        // 취소 요청: 기존 기록을 is_deleted = true로만 변경
        const { error: deleteError } = await supabase
          .from('attendance_records')
          .update({
            is_deleted: true,
            updated_at: new Date().toISOString()
          })
          .eq('id', requestData.attendance_record_id)
        
        if (deleteError) {
          throw deleteError
        }
      } else {
        // 수정 요청: 기존 기록을 is_deleted = true로 변경하고 새 기록 생성
        const { error: deleteError } = await supabase
          .from('attendance_records')
          .update({
            is_deleted: true,
            updated_at: new Date().toISOString()
          })
          .eq('id', requestData.attendance_record_id)
        
        if (deleteError) {
          throw deleteError
        }
        
        // 새로운 기록 생성 (수정된 데이터로)
        const { error: insertError } = await supabase
          .from('attendance_records')
          .insert({
            employee_id: requestData.employee_id,
            date: requestData.requested_date,
            check_in: requestData.requested_check_in,
            check_out: requestData.requested_check_out,
            scheduled_check_in: requestData.requested_scheduled_check_in,
            scheduled_check_out: requestData.requested_scheduled_check_out,
            break_time: requestData.requested_break_time,
            status: 'present',
            is_deleted: false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
        
        if (insertError) {
          throw insertError
        }
      }
    } else {
      // 새로운 기록 생성 (등록 요청)
      const { error: insertError } = await supabase
        .from('attendance_records')
        .insert({
          employee_id: requestData.employee_id,
          date: requestData.requested_date,
          check_in: requestData.requested_check_in,
          check_out: requestData.requested_check_out,
          scheduled_check_in: requestData.requested_scheduled_check_in,
          scheduled_check_out: requestData.requested_scheduled_check_out,
          break_time: requestData.requested_break_time,
          status: 'present',
          is_deleted: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
      
      if (insertError) {
        throw insertError
      }
    }
    
    // 요청 목록 다시 로드
    await loadApprovalRequests()
    
    const message = requestData.attendance_record_id 
      ? (requestData.request_type === 'cancel' 
          ? 'リクエストが承認され、勤務記録が無効化されました。'
          : 'リクエストが承認され、勤務記録が更新されました。')
      : 'リクエストが承認され、新しい勤務記録が作成されました。'
    
    alert(message)
  } catch (error) {
    console.error('요청 승인 중 오류 발생:', error)
    alert('リクエストの承認に失敗しました。')
  } finally {
    processingRequest.value = null
  }
}

// 요청 거부
const rejectRequest = async (requestId: string) => {
  processingRequest.value = requestId
  
  try {
    const { supabase } = await import('../lib/supabase')
    
    // 거부할 요청 정보 가져오기
    const { data: requestData, error: fetchError } = await supabase
      .from('attendance_change_requests')
      .select('*')
      .eq('id', requestId)
      .single()
    
    if (fetchError) {
      throw fetchError
    }
    
    if (!requestData) {
      throw new Error('요청을 찾을 수 없습니다.')
    }
    
    // 요청 상태를 거부로 업데이트
    const { error: updateError } = await supabase
      .from('attendance_change_requests')
      .update({ status: 'rejected' })
      .eq('id', requestId)
    
    if (updateError) {
      throw updateError
    }   
    
    // 요청 목록 다시 로드
    await loadApprovalRequests()
    
    const message = requestData.request_type === 'cancel' 
      ? 'リクエストが却下され、勤務記録が無効化されました。'
      : 'リクエストが却下されました。'
    
    alert(message)
  } catch (error) {
    console.error('요청 거부 중 오류 발생:', error)
    alert('リクエストの却下に失敗しました。')
  } finally {
    processingRequest.value = null
  }
}

// 필터 변경 시 페이지 초기화
const handleFilterChange = () => {
  currentPage.value = 1
}

// 페이지 변경
const changePage = (page: number) => {
  currentPage.value = page
}

onMounted(async () => {
  // 인증 상태 확인 및 관리자 권한 확인
  try {
    // auth store 초기화 확인
    if (!authStore.user) {
      await authStore.checkSession()
    }
    
    // 관리자 권한 확인
    if (!authStore.isAdmin) {
      alert('管理者権限が必要です。')
      return
    }
    
    await loadApprovalRequests()
  } catch (error) {
    console.error('페이지 초기화 중 오류 발생:', error)
    alert('管理者権限が必要です。')
  }
})
</script>

<template>
  <div class="approval-page">
    <!-- 로딩 상태 표시 -->
    <div v-if="loading" class="loading-overlay">
      <div class="loading-spinner"></div>
      <p>データを読み込み中...</p>
    </div>

    <div class="page-header">
      <h1>勤務記録承認管理</h1>
    </div>

    <!-- 필터 섹션 -->
    <div class="filter-section">
      <div class="filter-group">
        <label>ステータス:</label>
        <select v-model="statusFilter" @change="handleFilterChange" class="filter-select">
          <option value="all">すべて</option>
          <option value="pending">承認待ち</option>
          <option value="approved">承認済み</option>
          <option value="rejected">却下</option>
        </select>
      </div>
      
      <div class="filter-group">
        <label>リクエストタイプ:</label>
        <select v-model="requestTypeFilter" @change="handleFilterChange" class="filter-select">
          <option value="all">すべて</option>
          <option value="register">登録要請</option>
          <option value="modify">修正要請</option>
          <option value="cancel">取消要請</option>
        </select>
      </div>
    </div>

    <!-- 요청 목록 -->
    <div class="requests-section">
      <div v-if="filteredRequests.length === 0" class="no-requests">
        該当するリクエストがありません。
      </div>
      
      <div v-else class="requests-table">
        <table>
          <thead>
            <tr>
              <th>従業員</th>
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
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="request in paginatedRequests" :key="request.id">
              <td>
                <div class="employee-info">
                  <div class="employee-name">
                    {{ request.employees?.last_name }}{{ request.employees?.first_name }}
                  </div>
                  <div class="employee-code">
                    {{ request.employees?.employee_code }}
                  </div>
                  <div class="employee-dept">
                    {{ request.employees?.department }}
                  </div>
                </div>
              </td>
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
              <td>
                <div v-if="request.status === 'pending'" class="action-buttons">
                  <button 
                    @click="approveRequest(request.id)"
                    :disabled="processingRequest === request.id"
                    class="btn-approve"
                  >
                    {{ processingRequest === request.id ? '処理中...' : '承認' }}
                  </button>
                  <button 
                    @click="rejectRequest(request.id)"
                    :disabled="processingRequest === request.id"
                    class="btn-reject"
                  >
                    {{ processingRequest === request.id ? '処理中...' : '却下' }}
                  </button>
                </div>
                <div v-else class="no-action">
                  -
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- 페이지네이션 -->
    <div v-if="totalPages > 1" class="pagination">
      <button 
        @click="changePage(currentPage - 1)"
        :disabled="currentPage === 1"
        class="page-btn"
      >
        前へ
      </button>
      
      <span class="page-info">
        {{ currentPage }} / {{ totalPages }}
      </span>
      
      <button 
        @click="changePage(currentPage + 1)"
        :disabled="currentPage === totalPages"
        class="page-btn"
      >
        次へ
      </button>
    </div>
  </div>
</template>

<style scoped>
.approval-page {
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

.page-header {
  margin-bottom: 3rem;
  text-align: center;
}

.page-header h1 {
  margin: 0 0 1rem 0;
  color: #fff;
  font-size: 2.5rem;
  font-weight: 600;
}

.filter-section {
  display: flex;
  gap: 2rem;
  margin-bottom: 2rem;
  padding: 2rem;
  background: rgba(255, 255, 255, 0.9);
  border-radius: 12px;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
}

.filter-group {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.filter-group label {
  font-weight: 600;
  color: #2c3e50;
}

.filter-select {
  padding: 0.75rem;
  border: 2px solid #e0e0e0;
  border-radius: 6px;
  font-size: 1rem;
  background: white;
  min-width: 150px;
}

.filter-select:focus {
  outline: none;
  border-color: #3498db;
}

.requests-section {
  background: rgba(255, 255, 255, 0.9);
  border-radius: 20px;
  box-shadow: 0 6px 25px rgba(0, 0, 0, 0.1);
  padding: 2rem;
  margin-bottom: 2rem;
}

.no-requests {
  text-align: center;
  padding: 3rem;
  color: #7f8c8d;
  font-size: 1.2rem;
}

.requests-table table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9rem;
}

.requests-table th,
.requests-table td {
  color: #2c3e50;
  padding: 1rem;
  text-align: left;
  border-bottom: 1px solid #e0e0e0;
}

.requests-table th {
  background: #f8f9fa;
  font-weight: 600;
  color: #2c3e50;
  position: sticky;
  top: 0;
}

.employee-info {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.employee-name {
  font-weight: 600;
  color: #2c3e50;
}

.employee-code {
  font-size: 0.8rem;
  color: #7f8c8d;
}

.employee-dept {
  font-size: 0.8rem;
  color: #3498db;
  font-weight: 500;
}

.request-type-badge,
.status-badge {
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

.action-buttons {
  display: flex;
  gap: 0.5rem;
}

.btn-approve,
.btn-reject {
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 4px;
  font-size: 0.9rem;
  cursor: pointer;
  transition: all 0.3s ease;
}

.btn-approve {
  background: #27ae60;
  color: white;
}

.btn-approve:hover:not(:disabled) {
  background: #229954;
}

.btn-reject {
  background: #e74c3c;
  color: white;
}

.btn-reject:hover:not(:disabled) {
  background: #c0392b;
}

.btn-approve:disabled,
.btn-reject:disabled {
  background: #bdc3c7;
  cursor: not-allowed;
}

.no-action {
  color: #95a5a6;
  font-style: italic;
}

.pagination {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 1rem;
  margin-top: 2rem;
}

.page-btn {
  padding: 0.5rem 1rem;
  border: 2px solid #3498db;
  background: white;
  color: #3498db;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.3s ease;
}

.page-btn:hover:not(:disabled) {
  background: #3498db;
  color: white;
}

.page-btn:disabled {
  border-color: #bdc3c7;
  color: #bdc3c7;
  cursor: not-allowed;
}

.page-info {
  font-weight: 600;
  color: #2c3e50;
}

@media (max-width: 768px) {
  .approval-page {
    padding: 2rem;
    font-size: 1.2rem;
  }

  .filter-section {
    flex-direction: column;
    gap: 1rem;
  }

  .requests-table {
    overflow-x: auto;
  }

  .requests-table table {
    min-width: 800px;
  }

  .action-buttons {
    flex-direction: column;
  }
}
</style> 