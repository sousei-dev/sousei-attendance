-- ==========================================
-- facility_id 지원을 위한 데이터베이스 스키마 수정
-- ==========================================

-- 1. employees 테이블에 facility_id 컬럼 추가
ALTER TABLE employees 
ADD COLUMN IF NOT EXISTS facility_id VARCHAR(50);

-- 2. users 테이블에 facility_id 컬럼 추가
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS facility_id VARCHAR(50);

-- 3. facility_id 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_employees_facility_id ON employees(facility_id);
CREATE INDEX IF NOT EXISTS idx_users_facility_id ON users(facility_id);

-- 4. 기존 데이터에 기본 facility_id 설정 (예시)
-- 실제 운영 환경에서는 적절한 facility_id로 업데이트해야 합니다
UPDATE employees 
SET facility_id = 'FACILITY_001' 
WHERE facility_id IS NULL;

UPDATE users 
SET facility_id = 'FACILITY_001' 
WHERE facility_id IS NULL;

-- 5. RLS 정책 수정 - facility_id 기반 접근 제어
DROP POLICY IF EXISTS "Allow read access for all users" ON employees;
DROP POLICY IF EXISTS "Allow write access for authenticated users" ON employees;

-- admin은 모든 직원을 볼 수 있음
CREATE POLICY "Allow admin read access to all employees" ON employees
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE users.id = auth.uid() 
            AND users.role = 'admin'
        )
    );

-- staff는 자신의 facility_id와 일치하는 직원만 볼 수 있음
CREATE POLICY "Allow staff read access to facility employees" ON employees
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE users.id = auth.uid() 
            AND users.role = 'staff'
            AND users.facility_id = employees.facility_id
        )
    );

-- admin은 모든 직원에 대한 쓰기 권한
CREATE POLICY "Allow admin write access to all employees" ON employees
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE users.id = auth.uid() 
            AND users.role = 'admin'
        )
    );

-- staff는 자신의 facility_id와 일치하는 직원에 대한 쓰기 권한
CREATE POLICY "Allow staff write access to facility employees" ON employees
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE users.id = auth.uid() 
            AND users.role = 'staff'
            AND users.facility_id = employees.facility_id
        )
    );

-- 6. attendance_records 테이블의 RLS 정책도 수정
DROP POLICY IF EXISTS "Allow read access for all users" ON attendance_records;
DROP POLICY IF EXISTS "Allow write access for authenticated users" ON attendance_records;

-- admin은 모든 출퇴근 기록을 볼 수 있음
CREATE POLICY "Allow admin read access to all attendance records" ON attendance_records
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE users.id = auth.uid() 
            AND users.role = 'admin'
        )
    );

-- staff는 자신의 facility_id와 일치하는 직원의 출퇴근 기록만 볼 수 있음
CREATE POLICY "Allow staff read access to facility attendance records" ON attendance_records
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM users u
            JOIN employees e ON e.id = attendance_records.employee_id
            WHERE u.id = auth.uid() 
            AND u.role = 'staff'
            AND u.facility_id = e.facility_id
        )
    );

-- admin은 모든 출퇴근 기록에 대한 쓰기 권한
CREATE POLICY "Allow admin write access to all attendance records" ON attendance_records
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE users.id = auth.uid() 
            AND users.role = 'admin'
        )
    );

-- staff는 자신의 facility_id와 일치하는 직원의 출퇴근 기록에 대한 쓰기 권한
CREATE POLICY "Allow staff write access to facility attendance records" ON attendance_records
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM users u
            JOIN employees e ON e.id = attendance_records.employee_id
            WHERE u.id = auth.uid() 
            AND u.role = 'staff'
            AND u.facility_id = e.facility_id
        )
    );

-- 7. 결과 확인
SELECT 'Database schema updated for facility support!' as status;
SELECT 'Employees with facility_id:' as info, COUNT(*) as count FROM employees WHERE facility_id IS NOT NULL;
SELECT 'Users with facility_id:' as info, COUNT(*) as count FROM users WHERE facility_id IS NOT NULL; 