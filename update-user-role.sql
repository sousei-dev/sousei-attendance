-- ==========================================
-- 사용자 역할을 staff로 변경하고 facility_id 설정
-- ==========================================

-- 1. 특정 사용자를 staff로 변경 (이메일을 실제 이메일로 변경하세요)
UPDATE users 
SET role = 'staff', facility_id = 'FACILITY_001'
WHERE email = 'staff@example.com';

-- 2. 또는 특정 사용자 ID로 staff로 변경
-- UPDATE users 
-- SET role = 'staff', facility_id = 'FACILITY_001'
-- WHERE id = '사용자_UUID_여기에_입력';

-- 3. 현재 사용자 목록 확인
SELECT 
    id,
    email,
    role,
    facility_id,
    created_at
FROM users 
ORDER BY created_at DESC;

-- 4. staff 권한을 가진 사용자 확인
SELECT 
    id,
    email,
    role,
    facility_id,
    created_at
FROM users 
WHERE role = 'staff'
ORDER BY created_at DESC;

-- 5. admin 권한을 가진 사용자 확인
SELECT 
    id,
    email,
    role,
    facility_id,
    created_at
FROM users 
WHERE role = 'admin'
ORDER BY created_at DESC; 