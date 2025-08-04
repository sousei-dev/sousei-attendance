import { createRouter, createWebHistory } from 'vue-router'
import { supabase } from '@/lib/supabase'
import HomeView from '../views/HomeView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('../views/LoginView.vue'),
    },
    {
      path: '/',
      name: 'home',
      component: HomeView,
      meta: { requiresAuth: true },
    },
    {
      path: '/employeesAttendanceView',
      name: 'employeesAttendanceView',
      component: () => import('../views/EmployeesAttendanceView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/approval',
      name: 'approval',
      component: () => import('../views/ApprovalView.vue'),
      meta: { requiresAuth: true, requiresAdmin: true },
    },
    // {
    //   path: '/attendance',
    //   name: 'attendance',
    //   component: () => import('../views/AttendanceView.vue'),
    //   meta: { requiresAuth: true },
    // },
    // {
    //   path: '/employees',
    //   name: 'employees',
    //   component: () => import('../views/EmployeesView.vue'),
    //   meta: { requiresAuth: true },
    // },
    // {
    //   path: '/reports',
    //   name: 'reports',
    //   component: () => import('../views/ReportsView.vue'),
    //   meta: { requiresAuth: true },
    // },
  ],
})

// 네비게이션 가드
router.beforeEach(async (to, from, next) => {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    const isLoggedIn = !!session

    if (to.meta.requiresAuth && !isLoggedIn) {
      next('/login')
    } else if (to.path === '/login' && isLoggedIn) {
      next('/')
    } else if (to.meta.requiresAdmin) {
      // 관리자 권한 확인
      if (session?.user) {
        const { data: userData } = await supabase
          .from('users')
          .select('role')
          .eq('id', session.user.id)
          .single()
        
        if (userData?.role !== 'admin') {
          alert('管理者権限が必要です。')
          next('/')
          return
        }
      }
      next()
    } else {
      next()
    }
  } catch (error) {
    console.error('Navigation guard error:', error)
    if (to.meta.requiresAuth) {
      next('/login')
    } else {
      next()
    }
  }
})

export default router
