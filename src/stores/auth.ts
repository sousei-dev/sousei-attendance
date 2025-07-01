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
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession()

      if (sessionError) throw sessionError

      if (session?.user) {
        // 사용자 역할 정보 가져오기
        const { data: userData, error: userError } = await supabase
          .from('users')
          .select('id, email, role, facility_id')
          .eq('id', session.user.id)
          .single()

        if (userError) {
          console.error('User data fetch error:', userError)
          // 사용자 데이터가 없으면 기본 정보로 설정
          user.value = {
            id: session.user.id,
            email: session.user.email || '',
            role: 'user',
          }
        } else {
          user.value = userData
        }
      }
    } catch (err) {
      console.error('Session check error:', err)
      user.value = null
    }
  }

  // 로그인
  const login = async (email: string, password: string) => {
    loading.value = true
    error.value = null

    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (authError) throw authError

      if (data.user) {
        // 사용자 역할 정보 가져오기
        const { data: userData, error: userError } = await supabase
          .from('users')
          .select('id, email, role, facility_id')
          .eq('id', data.user.id)
          .single()

        if (userError) {
          console.error('User data fetch error:', userError)
          // 사용자 데이터가 없으면 기본 정보로 설정
          user.value = {
            id: data.user.id,
            email: data.user.email || '',
            role: 'user',
          }
        } else {
          user.value = userData
        }
        return user.value
      }
    } catch (err) {
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
      const { error: logoutError } = await supabase.auth.signOut()

      if (logoutError) throw logoutError

      user.value = null
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'ログアウトに失敗しました。'
      console.error('Logout error:', err)
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
    supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        // 사용자 역할 정보 가져오기
        const { data: userData, error: userError } = await supabase
          .from('users')
          .select('id, email, role, facility_id')
          .eq('id', session.user.id)
          .single()

        if (!userError && userData) {
          user.value = userData
        } else {
          // 사용자 데이터가 없으면 기본 정보로 설정
          user.value = {
            id: session.user.id,
            email: session.user.email || '',
            role: 'user',
          }
        }
      } else if (event === 'SIGNED_OUT') {
        user.value = null
      }
    })
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
