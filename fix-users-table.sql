-- ==========================================
-- users 테이블 문제 해결
-- ==========================================

-- 1. 기존 트리거 삭제 (있다면)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- 2. 기존 함수 삭제 (있다면)
DROP FUNCTION IF EXISTS handle_new_user();

-- 3. 기존 users 테이블 삭제 (있다면)
DROP TABLE IF EXISTS users CASCADE;

-- 4. users 테이블 재생성
CREATE TABLE users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL UNIQUE,
    role VARCHAR(20) DEFAULT 'user' CHECK (role IN ('admin', 'user')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. 인덱스 생성
CREATE INDEX idx_users_email ON users(email);

-- 6. RLS 활성화
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- 7. RLS 정책 생성
CREATE POLICY "Allow users to read their own data" ON users
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Allow users to update their own data" ON users
    FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Allow insert for authenticated users" ON users
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- 8. 새로운 사용자 등록 함수 생성 (수정된 버전)
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

-- 9. 트리거 재생성
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- 10. 기존 auth.users의 사용자들을 public.users에 추가
INSERT INTO users (id, email, role)
SELECT 
    au.id,
    au.email,
    'user' as role
FROM auth.users au
WHERE NOT EXISTS (
    SELECT 1 FROM users u WHERE u.id = au.id
);

-- 11. 결과 확인
SELECT 'Users table fixed successfully' as status;
SELECT COUNT(*) as total_users FROM users; 