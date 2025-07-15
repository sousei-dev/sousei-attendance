# sousei-attendance

근무 관리 시스템

## 개발 환경 설정

```bash
npm install
npm run dev
```

## 배포 가이드

### 1. 빌드

```bash
npm run build
```

### 2. 서버 설정

#### Apache 서버
- `dist` 폴더의 모든 파일을 웹 서버의 루트 디렉토리에 업로드
- `.htaccess` 파일이 자동으로 포함됩니다

#### Nginx 서버
- `dist` 폴더의 모든 파일을 웹 서버의 루트 디렉토리에 업로드
- `nginx.conf` 파일의 설정을 참고하여 서버 설정

#### 기타 서버
- 모든 요청을 `index.html`로 리다이렉트하도록 설정
- 정적 파일(CSS, JS, 이미지)은 직접 서빙

### 3. 자동 배포 스크립트 사용

```bash
./deploy.sh
```

### 4. Vercel 배포

#### Vercel CLI 사용
```bash
npm install -g vercel
vercel --prod
```

#### 자동 배포 스크립트 사용
```bash
./deploy-vercel.sh
```

#### GitHub 연동
- GitHub 저장소를 Vercel에 연결
- 자동 배포 설정

## 문제 해결

### 404 에러 (새로고침 시)
- 서버에서 SPA 라우팅을 제대로 처리하지 못할 때 발생
- 위의 서버 설정을 확인하세요

### 환경 변수
- `.env` 파일에서 Supabase 설정 확인
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`