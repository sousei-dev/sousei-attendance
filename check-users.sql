-- ==========================================
-- 현재 사용자 상태 확인
-- ==========================================

-- 1. auth.users 테이블의 사용자 확인
SELECT 'auth.users 테이블:' as info;
SELECT id, email, created_at FROM auth.users ORDER BY created_at DESC;

-- 2. public.users 테이블의 사용자 확인
SELECT 'public.users 테이블:' as info;
SELECT id, email, role, created_at FROM users ORDER BY created_at DESC;

-- 3. 누락된 사용자 확인
SELECT 'auth.users에 있지만 public.users에 없는 사용자:' as info;
SELECT 
    au.id,
    au.email,
    au.created_at
FROM auth.users au
WHERE NOT EXISTS (
    SELECT 1 FROM users u WHERE u.id = au.id
);

-- 4. users 테이블 구조 확인
SELECT 'users 테이블 구조:' as info;
SELECT 
    column_name, 
    data_type, 
    is_nullable, 
    column_default
FROM information_schema.columns 
WHERE table_schema = 'public' 
AND table_name = 'users'
ORDER BY ordinal_position;

-- 5. 트리거 상태 확인
SELECT '트리거 상태:' as info;
SELECT 
    trigger_name,
    event_manipulation,
    action_statement
FROM information_schema.triggers 
WHERE trigger_schema = 'public' 
AND event_object_table = 'users'; 