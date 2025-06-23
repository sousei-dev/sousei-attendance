-- ==========================================
-- 데이터베이스 상태 확인 및 문제 해결
-- ==========================================

-- 1. users 테이블이 존재하는지 확인
SELECT EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'users'
) as users_table_exists;

-- 2. users 테이블 구조 확인
SELECT 
    column_name, 
    data_type, 
    is_nullable, 
    column_default
FROM information_schema.columns 
WHERE table_schema = 'public' 
AND table_name = 'users'
ORDER BY ordinal_position;

-- 3. 트리거가 존재하는지 확인
SELECT 
    trigger_name,
    event_manipulation,
    action_statement
FROM information_schema.triggers 
WHERE trigger_schema = 'public' 
AND event_object_table = 'users';

-- 4. handle_new_user 함수가 존재하는지 확인
SELECT EXISTS (
    SELECT FROM information_schema.routines 
    WHERE routine_schema = 'public' 
    AND routine_name = 'handle_new_user'
) as function_exists;

-- 5. auth.users 테이블에 사용자가 있는지 확인
SELECT COUNT(*) as auth_users_count FROM auth.users;

-- 6. public.users 테이블에 사용자가 있는지 확인
SELECT COUNT(*) as public_users_count FROM users;

-- 7. RLS 정책 확인
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual
FROM pg_policies 
WHERE tablename = 'users';

-- 8. 현재 에러 로그 확인 (최근 10개)
SELECT 
    timestamp,
    level,
    message
FROM pg_stat_activity 
WHERE state = 'active'
ORDER BY timestamp DESC 
LIMIT 10; 