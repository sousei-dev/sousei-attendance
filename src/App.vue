<script setup lang="ts">
import { RouterView, useRouter } from 'vue-router'
import { computed, onMounted } from 'vue'
import { useAuthStore } from './stores/auth'

const router = useRouter()
const authStore = useAuthStore()

const isLoggedIn = computed(() => authStore.isAuthenticated)
const adminUsername = computed(() => authStore.user?.email || '')

const handleLogout = async () => {
  try {
    await authStore.logout()
    router.push('/login')
  } catch (error) {
    console.error('Logout error:', error)
  }
}

onMounted(async () => {
  // 인증 상태 확인 및 리스너 설정
  await authStore.checkSession()
  authStore.setupAuthListener()
})
</script>

<template>
  <div id="app">
    <header v-if="isLoggedIn" class="app-header">
      <div class="header-content">
        <h1 class="app-title">出退勤システム</h1>
        <nav class="main-nav">
          <!-- <RouterLink to="/" class="nav-link">ホーム</RouterLink> -->
          <!-- <RouterLink to="/attendance" class="nav-link">出退勤記録</RouterLink>
          <RouterLink to="/employees" class="nav-link">従業員管理</RouterLink>
          <RouterLink to="/reports" class="nav-link">勤務レポート</RouterLink> -->
        </nav>
        <div class="user-section">
          <span class="admin-info">{{ adminUsername }} 管理者</span>
          <button @click="handleLogout" class="logout-btn">ログアウト</button>
        </div>
      </div>
    </header>

    <main class="main-content">
      <RouterView />
    </main>
  </div>
</template>

<style scoped>
#app {
  min-height: 100vh;
  width: 100%;
  max-width: 100%;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  overflow-x: hidden;
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

.app-header {
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  box-shadow: 0 2px 20px rgba(0, 0, 0, 0.1);
  padding: 1rem 0;
  position: sticky;
  top: 0;
  z-index: 100;
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
}

.header-content {
  max-width: 100%;
  margin: 0 auto;
  padding: 0 1rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 1rem;
  box-sizing: border-box;
}

.app-title {
  color: #2c3e50;
  margin: 0;
  font-size: 1.5rem;
  font-weight: 600;
  white-space: nowrap;
}

.main-nav {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
  justify-content: center;
}

.nav-link {
  color: #2c3e50;
  text-decoration: none;
  padding: 0.5rem 0.75rem;
  border-radius: 8px;
  transition: all 0.3s ease;
  font-weight: 500;
  font-size: 0.9rem;
  white-space: nowrap;
}

.nav-link:hover {
  background-color: #667eea;
  color: white;
}

.nav-link.router-link-active {
  background-color: #667eea;
  color: white;
}

.user-section {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
}

.admin-info {
  color: #667eea;
  font-weight: 600;
  font-size: 0.9rem;
  white-space: nowrap;
}

.logout-btn {
  background: #e74c3c;
  color: white;
  border: none;
  padding: 0.5rem 1rem;
  border-radius: 6px;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
  white-space: nowrap;
}

.logout-btn:hover {
  background: #c0392b;
  transform: translateY(-1px);
}

.main-content {
  width: 100%;
  max-width: 100%;
  min-height: calc(100vh - 80px);
  padding: 2rem;
  margin: 0;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  overflow-x: hidden;
}

/* 글로벌 레이아웃 문제 방지용 스타일 */
:global(html, body) {
  height: 100%;
  width: 100%;
  margin: 0;
  padding: 0;
  box-sizing: border-box;
  overflow-x: hidden;
}

:global(#app) {
  height: 100%;
  width: 100%;
  margin: 0;
  padding: 0;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  overflow-x: hidden;
}

@media (max-width: 768px) {
  .header-content {
    flex-direction: column;
    gap: 1rem;
    text-align: center;
    padding: 0 0.5rem;
  }

  .app-title {
    font-size: 1.2rem;
  }

  .main-nav {
    width: 100%;
    justify-content: center;
    gap: 0.25rem;
  }

  .nav-link {
    padding: 0.4rem 0.6rem;
    font-size: 0.8rem;
  }

  .user-section {
    flex-direction: column;
    gap: 0.5rem;
  }

  .main-content {
    padding: 1rem;
  }
}

@media (max-width: 480px) {
  .app-title {
    font-size: 1rem;
  }

  .nav-link {
    padding: 0.3rem 0.5rem;
    font-size: 0.75rem;
  }

  .main-content {
    padding: 0.5rem;
  }
}
</style>
