-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create employees table
CREATE TABLE employees (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    department VARCHAR(255) NOT NULL,
    position VARCHAR(255) NOT NULL,
    employee_number VARCHAR(50) UNIQUE NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create attendance_records table
CREATE TABLE attendance_records (
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

-- Create users table for authentication
CREATE TABLE users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL UNIQUE,
    role VARCHAR(20) DEFAULT 'user' CHECK (role IN ('admin', 'user')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX idx_employees_is_active ON employees(is_active);
CREATE INDEX idx_attendance_records_employee_date ON attendance_records(employee_id, date);
CREATE INDEX idx_users_email ON users(email);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
CREATE TRIGGER update_employees_updated_at BEFORE UPDATE ON employees
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_attendance_records_updated_at BEFORE UPDATE ON attendance_records
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert sample employee data
INSERT INTO employees (name, department, position, employee_number) VALUES
('田中太郎', '営業部', '主任', 'EMP001'),
('佐藤花子', '人事部', '課長', 'EMP002'),
('鈴木一郎', '開発部', 'エンジニア', 'EMP003'),
('高橋美咲', '営業部', '営業担当', 'EMP004'),
('渡辺健太', '開発部', 'シニアエンジニア', 'EMP005');

-- Enable Row Level Security (RLS)
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for employees table
CREATE POLICY "Allow read access for all users" ON employees
    FOR SELECT USING (true);

CREATE POLICY "Allow write access for authenticated users" ON employees
    FOR ALL USING (auth.role() = 'authenticated');

-- Create RLS policies for attendance_records table
CREATE POLICY "Allow read access for all users" ON attendance_records
    FOR SELECT USING (true);

CREATE POLICY "Allow write access for authenticated users" ON attendance_records
    FOR ALL USING (auth.role() = 'authenticated');

-- Create RLS policies for users table
CREATE POLICY "Allow users to read their own data" ON users
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Allow users to update their own data" ON users
    FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Allow insert for authenticated users" ON users
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Create function to handle new user registration
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO users (id, email, role)
    VALUES (NEW.id, NEW.email, 'user');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for new user registration
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ==========================================
-- 관리자 계정 추가를 위한 SQL 명령어들
-- ==========================================

-- 1. Supabase Auth에서 사용자 생성 후, 해당 사용자를 관리자로 설정
-- (Supabase 대시보드에서 Authentication > Users > Add user로 사용자 생성 후)

-- 2. 생성된 사용자를 관리자로 설정
-- 아래 SQL을 실행하여 특정 이메일의 사용자를 관리자로 변경
UPDATE users SET role = 'admin' WHERE email = 'admin@example.com';

-- 3. 또는 특정 사용자 ID로 관리자 설정
-- UPDATE users SET role = 'admin' WHERE id = '사용자_UUID_여기에_입력';

-- 4. 현재 등록된 모든 사용자 확인
SELECT id, email, role, created_at FROM users ORDER BY created_at DESC;

-- 5. 관리자 권한을 가진 사용자만 확인
SELECT id, email, role, created_at FROM users WHERE role = 'admin';

-- 6. 사용자 역할 변경 (일반 사용자 → 관리자)
-- UPDATE users SET role = 'admin' WHERE email = 'user@example.com';

-- 7. 사용자 역할 변경 (관리자 → 일반 사용자)
-- UPDATE users SET role = 'user' WHERE email = 'admin@example.com';

-- 8. 특정 사용자 삭제 (주의: auth.users에서도 삭제됨)
-- DELETE FROM users WHERE email = 'user@example.com'; 