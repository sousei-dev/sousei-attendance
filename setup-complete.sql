-- ==========================================
-- 완전한 데이터베이스 설정
-- ==========================================

-- 1. UUID 확장 활성화
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. employees 테이블 생성
CREATE TABLE IF NOT EXISTS employees (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    department VARCHAR(255) NOT NULL,
    position VARCHAR(255) NOT NULL,
    employee_number VARCHAR(50) UNIQUE NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. attendance_records 테이블 생성
CREATE TABLE IF NOT EXISTS attendance_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    check_in TIME,
    check_out TIME,
    total_hours DECIMAL(4,2),
    status VARCHAR(20) DEFAULT 'present' CHECK (status IN ('present', 'late', 'early-leave', 'absent')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(employee_id, date)
);

-- 4. users 테이블 생성
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL UNIQUE,
    role VARCHAR(20) DEFAULT 'user' CHECK (role IN ('admin', 'user')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_employees_is_active ON employees(is_active);
CREATE INDEX IF NOT EXISTS idx_attendance_records_employee_date ON attendance_records(employee_id, date);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- 6. updated_at 업데이트 함수 생성
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 7. 트리거 생성
DROP TRIGGER IF EXISTS update_employees_updated_at ON employees;
CREATE TRIGGER update_employees_updated_at 
    BEFORE UPDATE ON employees
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_attendance_records_updated_at ON attendance_records;
CREATE TRIGGER update_attendance_records_updated_at 
    BEFORE UPDATE ON attendance_records
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 8. 샘플 직원 데이터 삽입 (중복 방지)
INSERT INTO employees (name, department, position, employee_number) 
SELECT * FROM (VALUES
    ('田中太郎', '営業部', '主任', 'EMP001'),
    ('佐藤花子', '人事部', '課長', 'EMP002'),
    ('鈴木一郎', '開発部', 'エンジニア', 'EMP003'),
    ('高橋美咲', '営業部', '営業担当', 'EMP004'),
    ('渡辺健太', '開発部', 'シニアエンジニア', 'EMP005')
) AS v(name, department, position, employee_number)
WHERE NOT EXISTS (
    SELECT 1 FROM employees WHERE employee_number = v.employee_number
);

-- 9. RLS 활성화
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- 10. RLS 정책 생성 (기존 정책 삭제 후 재생성)
DROP POLICY IF EXISTS "Allow read access for all users" ON employees;
DROP POLICY IF EXISTS "Allow write access for authenticated users" ON employees;
DROP POLICY IF EXISTS "Allow read access for all users" ON attendance_records;
DROP POLICY IF EXISTS "Allow write access for authenticated users" ON attendance_records;
DROP POLICY IF EXISTS "Allow users to read their own data" ON users;
DROP POLICY IF EXISTS "Allow users to update their own data" ON users;
DROP POLICY IF EXISTS "Allow insert for authenticated users" ON users;

-- employees 정책
CREATE POLICY "Allow read access for all users" ON employees
    FOR SELECT USING (true);

CREATE POLICY "Allow write access for authenticated users" ON employees
    FOR ALL USING (auth.role() = 'authenticated');

-- attendance_records 정책
CREATE POLICY "Allow read access for all users" ON attendance_records
    FOR SELECT USING (true);

CREATE POLICY "Allow write access for authenticated users" ON attendance_records
    FOR ALL USING (auth.role() = 'authenticated');

-- users 정책
CREATE POLICY "Allow users to read their own data" ON users
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Allow users to update their own data" ON users
    FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Allow insert for authenticated users" ON users
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- 11. 사용자 등록 함수 생성
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    -- 중복 방지
    IF NOT EXISTS (SELECT 1 FROM users WHERE id = NEW.id) THEN
        INSERT INTO users (id, email, role)
        VALUES (NEW.id, NEW.email, 'user');
    END IF;
    RETURN NEW;
EXCEPTION
    WHEN OTHERS THEN
        -- 에러 발생 시 로그 출력
        RAISE LOG 'Error in handle_new_user: %', SQLERRM;
        RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 12. 트리거 생성
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- 13. 기존 auth.users의 사용자들을 public.users에 추가
INSERT INTO users (id, email, role)
SELECT 
    au.id,
    au.email,
    'user' as role
FROM auth.users au
WHERE NOT EXISTS (
    SELECT 1 FROM users u WHERE u.id = au.id
);

-- 14. 결과 확인
SELECT 'Database setup completed successfully!' as status;
SELECT 'Tables created:' as info;
SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('employees', 'attendance_records', 'users');
SELECT 'Total users:' as info, COUNT(*) as count FROM users; 