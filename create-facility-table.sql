-- ==========================================
-- Facility 테이블 생성 및 샘플 데이터 추가
-- ==========================================

-- 1. facilities 테이블 생성
CREATE TABLE IF NOT EXISTS facilities (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(255) NOT NULL
);

-- 2. 샘플 facility 데이터 추가
INSERT INTO facilities (id, name) VALUES
('FACILITY_001', '本社'),
('FACILITY_002', '支店A'),
('FACILITY_003', '支店B')
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name;

-- 3. RLS 활성화
ALTER TABLE facilities ENABLE ROW LEVEL SECURITY;

-- 4. RLS 정책 생성
CREATE POLICY "Allow read access for all authenticated users" ON facilities
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Allow write access for admin users" ON facilities
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE users.id = auth.uid() 
            AND users.role = 'admin'
        )
    );

-- 5. 결과 확인
SELECT 'Facility table created successfully!' as status;
SELECT 'Facilities:' as info;
SELECT * FROM facilities ORDER BY id; 