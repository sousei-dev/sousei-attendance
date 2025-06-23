<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const router = useRouter()
const authStore = useAuthStore()

const email = ref('')
const password = ref('')
const isLoading = computed(() => authStore.loading)
const errorMessage = ref('')

const handleLogin = async () => {
  if (!email.value || !password.value) {
    errorMessage.value = 'メールアドレスとパスワードを入力してください。'
    return
  }

  errorMessage.value = ''

  try {
    await authStore.login(email.value, password.value)
    router.push('/')
  } catch {
    errorMessage.value = authStore.error || 'ログインに失敗しました。'
  }
}

const handleKeyPress = (event: KeyboardEvent) => {
  if (event.key === 'Enter') {
    handleLogin()
  }
}
</script>

<template>
  <div class="login-page">
    <div class="login-container">
      <div class="login-header">
        <h1>管理者ログイン</h1>
        <p>出退勤システム管理者ページ</p>
      </div>

      <div class="login-form">
        <div v-if="errorMessage" class="error-message">
          {{ errorMessage }}
        </div>

        <div class="form-group">
          <label for="email">メールアドレス</label>
          <input
            id="email"
            v-model="email"
            type="email"
            placeholder="メールアドレスを入力してください"
            class="form-input"
            :disabled="isLoading"
            @keypress="handleKeyPress"
          />
        </div>

        <div class="form-group">
          <label for="password">パスワード</label>
          <input
            id="password"
            v-model="password"
            type="password"
            placeholder="パスワードを入力してください"
            class="form-input"
            :disabled="isLoading"
            @keypress="handleKeyPress"
          />
        </div>

        <button @click="handleLogin" :disabled="isLoading" class="login-btn">
          <span v-if="isLoading" class="loading-spinner"></span>
          {{ isLoading ? 'ログイン中...' : 'ログイン' }}
        </button>

        <div class="login-info">
          <p><strong>使用カウント:</strong></p>
          <p>メール: admin@admin.com</p>
          <p>パスワード: *****</p>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.login-page {
  min-height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  box-sizing: border-box;
}

.login-container {
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  border-radius: 20px;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1);
  padding: 3rem;
  width: 100%;
  max-width: 400px;
  text-align: center;
}

.login-header {
  margin-bottom: 2rem;
}

.login-header h1 {
  color: #2c3e50;
  font-size: 2rem;
  font-weight: 700;
  margin: 0 0 0.5rem 0;
}

.login-header p {
  color: #7f8c8d;
  font-size: 1rem;
  margin: 0;
}

.login-form {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.error-message {
  background: #f8d7da;
  color: #721c24;
  padding: 1rem;
  border-radius: 8px;
  border: 1px solid #f5c6cb;
  font-size: 0.9rem;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  text-align: left;
}

.form-group label {
  color: #2c3e50;
  font-weight: 600;
  font-size: 0.9rem;
}

.form-input {
  padding: 1rem;
  border: 2px solid #e0e0e0;
  border-radius: 8px;
  font-size: 1rem;
  background: white;
  transition: all 0.3s ease;
  box-sizing: border-box;
}

.form-input:focus {
  outline: none;
  border-color: #667eea;
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
}

.form-input:disabled {
  background: #f8f9fa;
  cursor: not-allowed;
}

.login-btn {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  padding: 1rem;
  border-radius: 8px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  min-height: 48px;
}

.login-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 8px 25px rgba(102, 126, 234, 0.3);
}

.login-btn:disabled {
  opacity: 0.7;
  cursor: not-allowed;
  transform: none;
}

.loading-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid transparent;
  border-top: 2px solid white;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}

.login-info {
  background: #f8f9fa;
  border-radius: 8px;
  padding: 1rem;
  margin-top: 1rem;
  border: 1px solid #e0e0e0;
}

.login-info p {
  margin: 0.25rem 0;
  font-size: 0.85rem;
  color: #7f8c8d;
}

.login-info p:first-child {
  font-weight: 600;
  color: #2c3e50;
  margin-bottom: 0.5rem;
}

.note {
  font-size: 0.8rem;
  color: #7f8c8d;
}

@media (max-width: 480px) {
  .login-page {
    padding: 1rem;
  }

  .login-container {
    padding: 2rem;
  }

  .login-header h1 {
    font-size: 1.5rem;
  }

  .login-header p {
    font-size: 0.9rem;
  }
}
</style>
