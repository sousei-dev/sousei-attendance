-- ==========================================
-- 누락된 사용자 수동 추가
-- ==========================================

-- 1. auth.users에 있지만 public.users에 없는 사용자들을 추가
INSERT INTO users (id, email, role)
SELECT 
    au.id,
    au.email,
    'user' as role
FROM auth.users au
WHERE NOT EXISTS (
    SELECT 1 FROM users u WHERE u.id = au.id
);

-- 2. 결과 확인
SELECT '추가된 사용자 수:' as info, COUNT(*) as count
FROM auth.users au
WHERE NOT EXISTS (
    SELECT 1 FROM users u WHERE u.id = au.id
);

-- 3. 모든 사용자 확인
SELECT '전체 사용자 목록:' as info;
SELECT 
    u.id,
    u.email,
    u.role,
    u.created_at
FROM users u 
ORDER BY u.created_at DESC;

-- 4. 특정 사용자를 관리자로 설정 (이메일 변경 필요)
-- UPDATE users SET role = 'admin' WHERE email = 'admin@example.com';

-- 5. 관리자 권한 확인
SELECT '관리자 권한을 가진 사용자:' as info;
SELECT 
    id,
    email,
    role,
    created_at
FROM users 
WHERE role = 'admin'
ORDER BY created_at DESC; 