-- ==========================================
-- 관리자 계정 설정을 위한 SQL 명령어들
-- ==========================================

-- 1. 현재 등록된 모든 사용자 확인
SELECT id, email, role, created_at FROM users ORDER BY created_at DESC;

-- 2. 관리자 권한을 가진 사용자만 확인
SELECT id, email, role, created_at FROM users WHERE role = 'admin';

-- 3. 특정 이메일의 사용자를 관리자로 설정
-- (이메일 주소를 실제 사용할 이메일로 변경하세요)
UPDATE users SET role = 'admin' WHERE email = 'admin@example.com';

-- 4. 특정 사용자 ID로 관리자 설정
-- (사용자 ID를 실제 UUID로 변경하세요)
-- UPDATE users SET role = 'admin' WHERE id = '사용자_UUID_여기에_입력';

-- 5. 일반 사용자를 관리자로 변경
-- UPDATE users SET role = 'admin' WHERE email = 'user@example.com';

-- 6. 관리자를 일반 사용자로 변경
-- UPDATE users SET role = 'user' WHERE email = 'admin@example.com';

-- 7. 특정 사용자 삭제 (주의: auth.users에서도 삭제됨)
-- DELETE FROM users WHERE email = 'user@example.com';

-- 8. 모든 사용자의 역할 확인
SELECT 
    u.id,
    u.email,
    u.role,
    u.created_at,
    CASE 
        WHEN u.role = 'admin' THEN '관리자'
        WHEN u.role = 'user' THEN '일반사용자'
        ELSE '알 수 없음'
    END as role_korean
FROM users u 
ORDER BY u.created_at DESC;

-- 9. 새로운 관리자 계정을 직접 생성 (auth.users에 이미 존재하는 경우)
-- INSERT INTO users (id, email, role) 
-- VALUES ('auth_users의_UUID', 'admin@example.com', 'admin');

-- 10. 사용자 통계 확인
SELECT 
    role,
    COUNT(*) as user_count,
    MIN(created_at) as first_user,
    MAX(created_at) as latest_user
FROM users 
GROUP BY role;

-- ==========================================
-- 사용법:
-- ==========================================
-- 1. Supabase 대시보드에서 Authentication > Users > Add user로 사용자 생성
-- 2. 위의 SQL 명령어 중 3번을 실행하여 관리자 권한 부여
-- 3. 1번 명령어로 결과 확인
-- ========================================== 