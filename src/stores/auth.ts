import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase, type AuthUser } from '@/lib/supabase'

export const useAuthStore = defineStore('auth', () => {
  // 상태
  const user = ref<AuthUser | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  // 계산된 속성
  const isAuthenticated = computed(() => !!user.value)
  const isAdmin = computed(() => user.value?.role === 'admin')
  const isStaff = computed(() => user.value?.role === 'staff')

  // 현재 세션 확인
  const checkSession = async () => {
    try {
      console.log('=== Supabase 세션 확인 시작 ===')
      
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession()

      console.log('세션 데이터:', session)
      console.log('세션 에러:', sessionError)

      if (sessionError) {
        console.error('세션 에러 발생:', sessionError)
        throw sessionError
      }

      if (session?.user) {
        console.log('사용자 세션 발견:', session.user)
        
        try {
          // Supabase 연결 상태 먼저 확인
          console.log('Supabase 연결 상태 확인 중...')
          const { error: testError } = await supabase
            .from('users')
            .select('count')
            .limit(1)
          
          if (testError) {
            console.error('Supabase 연결 에러:', testError)
            throw new Error('Supabase 연결 실패')
          }
          
          console.log('Supabase 연결 확인 완료')
          
          // 타임아웃 시간을 10초로 증가
          const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error('사용자 데이터 쿼리 타임아웃 (10초)')), 10000)
          })
          
          const userDataPromise = supabase
            .from('users')
            .select('id, email, role, facility_id')
            .eq('id', session.user.id)
            .single()
          
          const { data: userData, error: userError } = await Promise.race([
            userDataPromise,
            timeoutPromise
          ])

          console.log('사용자 데이터 쿼리 결과:', { userData, userError })

          if (userError) {
            console.error('사용자 데이터 가져오기 에러:', userError)
            // 사용자 데이터가 없으면 기본 정보로 설정
            user.value = {
              id: session.user.id,
              email: session.user.email || '',
              role: 'user',
            }
            console.log('기본 사용자 정보로 설정:', user.value)
          } else {
            user.value = userData
            console.log('사용자 정보 설정 완료:', user.value)
          }
        } catch (err) {
          console.error('사용자 데이터 가져오기 실패:', err)
          
          // 타임아웃 에러인 경우 특별 처리
          if (err instanceof Error && err.message.includes('타임아웃')) {
            console.log('세션 확인 중 타임아웃 발생 - 기본 정보로 설정')
          } else if (err instanceof Error && err.message.includes('Supabase 연결 실패')) {
            console.log('Supabase 연결 실패 - 기본 정보로 설정')
          }
          
          // 에러 발생 시에도 기본 정보로 설정
          user.value = {
            id: session.user.id,
            email: session.user.email || '',
            role: 'user',
          }
          console.log('에러 발생으로 인한 기본 사용자 정보 설정:', user.value)
        }
      } else {
        console.log('세션이 없음 - 사용자 정보 초기화')
        user.value = null
      }
      
      console.log('=== 세션 확인 완료 ===')
    } catch (err) {
      console.error('세션 확인 중 에러 발생:', err)
      user.value = null
    }
  }

  // 로그인
  const login = async (email: string, password: string) => {
    loading.value = true
    error.value = null

    try {
      console.log('=== 로그인 시작 ===')
      console.log('로그인 시도:', email)
      
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      console.log('Supabase 로그인 결과:', { data, authError })

      if (authError) {
        console.error('Supabase 로그인 에러:', authError)
        throw authError
      }

      if (data.user) {
        console.log('로그인 성공 - 사용자 정보:', data.user)
        
        // 사용자 역할 정보 가져오기
        const { data: userData, error: userError } = await supabase
          .from('users')
          .select('id, email, role, facility_id')
          .eq('id', data.user.id)
          .single()

        console.log('사용자 역할 정보 쿼리 결과:', { userData, userError })

        if (userError) {
          console.error('사용자 역할 정보 가져오기 에러:', userError)
          // 사용자 데이터가 없으면 기본 정보로 설정
          user.value = {
            id: data.user.id,
            email: data.user.email || '',
            role: 'user',
          }
          console.log('기본 사용자 정보로 설정:', user.value)
        } else {
          user.value = userData
          console.log('사용자 역할 정보 설정 완료:', user.value)
        }
        
        console.log('=== 로그인 완료 ===')
        return user.value
      }
    } catch (err) {
      console.error('로그인 중 에러 발생:', err)
      error.value = err instanceof Error ? err.message : 'ログインに失敗しました。'
      console.error('Login error:', err)
      throw err
    } finally {
      loading.value = false
    }
  }

  // 로그아웃
  const logout = async () => {
    loading.value = true
    error.value = null

    try {
      console.log('=== 로그아웃 시작 ===')
      
      const { error: logoutError } = await supabase.auth.signOut()

      console.log('Supabase 로그아웃 결과:', { logoutError })

      if (logoutError) {
        console.error('Supabase 로그아웃 에러:', logoutError)
        throw logoutError
      }

      console.log('로그아웃 성공 - 사용자 정보 초기화')
      user.value = null
      console.log('=== 로그아웃 완료 ===')
      
    } catch (err) {
      console.error('로그아웃 중 에러 발생:', err)
      error.value = err instanceof Error ? err.message : 'ログアウトに失敗しました。'
      
      // 에러가 발생해도 사용자 상태는 초기화
      console.log('에러 발생으로 인한 사용자 정보 초기화')
      user.value = null
      
      throw err
    } finally {
      loading.value = false
    }
  }

  // 회원가입 (관리자용)
  const signUp = async (email: string, password: string, role: 'admin' | 'user' | 'staff' = 'user', facility_id?: string) => {
    loading.value = true
    error.value = null

    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
      })

      if (signUpError) throw signUpError

      if (data.user) {
        // 사용자 역할 정보 저장
        const userData: {
          id: string
          email: string
          role: 'admin' | 'user' | 'staff'
          facility_id?: string
        } = {
          id: data.user.id,
          email: data.user.email!,
          role,
        }
        
        if (facility_id) {
          userData.facility_id = facility_id
        }

        const { error: userError } = await supabase.from('users').insert(userData)

        if (userError) throw userError

        return data.user
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'アカウント作成に失敗しました。'
      console.error('Sign up error:', err)
      throw err
    } finally {
      loading.value = false
    }
  }

  // 인증 상태 변경 감지
  const setupAuthListener = () => {
    console.log('=== 인증 상태 리스너 설정 ===')
    
    // 중복 리스너 방지를 위한 플래그
    let isListenerActive = false
    
    supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('인증 상태 변경 감지:', { event, session })
      
      // 중복 처리 방지
      if (isListenerActive) {
        console.log('이미 리스너가 처리 중 - 건너뜀')
        return
      }
      
      isListenerActive = true
      
      try {
        if (event === 'SIGNED_IN' && session?.user) {
          console.log('사용자 로그인 감지:', session.user)
          
          try {
            // Supabase 연결 상태 먼저 확인
            console.log('리스너에서 Supabase 연결 상태 확인 중...')
            const { error: testError } = await supabase
              .from('users')
              .select('count')
              .limit(1)
            
            if (testError) {
              console.error('리스너에서 Supabase 연결 에러:', testError)
              throw new Error('Supabase 연결 실패')
            }
            
            console.log('리스너에서 Supabase 연결 확인 완료')
            
            // 타임아웃 시간을 10초로 증가
            const timeoutPromise = new Promise<never>((_, reject) => {
              setTimeout(() => reject(new Error('사용자 데이터 쿼리 타임아웃 (10초)')), 10000)
            })
            
            const userDataPromise = supabase
              .from('users')
              .select('id, email, role, facility_id')
              .eq('id', session.user.id)
              .single()
            
            const { data: userData, error: userError } = await Promise.race([
              userDataPromise,
              timeoutPromise
            ])

            console.log('리스너에서 사용자 데이터 쿼리 결과:', { userData, userError })

            if (!userError && userData) {
              user.value = userData
              console.log('리스너에서 사용자 정보 설정:', user.value)
            } else {
              console.log('사용자 데이터 없음 또는 에러 - 기본 정보로 설정')
              // 사용자 데이터가 없으면 기본 정보로 설정
              user.value = {
                id: session.user.id,
                email: session.user.email || '',
                role: 'user',
              }
              console.log('리스너에서 기본 사용자 정보 설정:', user.value)
            }
          } catch (err) {
            console.error('리스너에서 사용자 데이터 가져오기 실패:', err)
            console.error('에러 상세 정보:', {
              message: err instanceof Error ? err.message : 'Unknown error',
              stack: err instanceof Error ? err.stack : undefined,
              name: err instanceof Error ? err.name : undefined
            })
            
            // 타임아웃 에러인 경우 특별 처리
            if (err instanceof Error && err.message.includes('타임아웃')) {
              console.log('타임아웃 발생 - 기본 정보로 설정하고 나중에 재시도')
            } else if (err instanceof Error && err.message.includes('Supabase 연결 실패')) {
              console.log('Supabase 연결 실패 - 기본 정보로 설정')
            }
            
            // 에러 발생 시에도 기본 정보로 설정
            user.value = {
              id: session.user.id,
              email: session.user.email || '',
              role: 'user',
            }
            console.log('에러 발생으로 인한 기본 사용자 정보 설정:', user.value)
          }
        } else if (event === 'SIGNED_OUT') {
          console.log('사용자 로그아웃 감지 - 사용자 정보 초기화')
          user.value = null
        } else {
          console.log('기타 인증 상태 변경:', event)
        }
      } catch (err) {
        console.error('리스너 처리 중 예상치 못한 에러:', err)
      } finally {
        isListenerActive = false
      }
    })
    
    console.log('=== 인증 상태 리스너 설정 완료 ===')
  }

  return {
    // 상태
    user,
    loading,
    error,

    // 계산된 속성
    isAuthenticated,
    isAdmin,
    isStaff,

    // 메서드
    checkSession,
    login,
    logout,
    signUp,
    setupAuthListener,
  }
})
