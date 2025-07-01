# Facility 기반 접근 제어 설정 가이드

## 개요
이 시스템은 사용자의 역할(role)과 시설(facility_id)에 따라 직원 목록에 대한 접근을 제어합니다.

## 사용자 역할
- **admin**: 모든 직원과 출퇴근 기록에 접근 가능
- **staff**: 자신의 facility_id와 일치하는 직원과 출퇴근 기록에만 접근 가능
- **user**: 접근 권한 없음 (기본값)

## 설정 단계

### 1. 데이터베이스 스키마 업데이트
Supabase 대시보드에서 `add-facility-support.sql` 파일을 실행하여 다음을 수행:
- employees 테이블에 facility_id 컬럼 추가
- users 테이블에 facility_id 컬럼 추가
- RLS 정책 업데이트

### 2. 사용자 역할 설정
`update-user-role.sql` 파일을 실행하여 사용자 역할을 설정:

```sql
-- staff로 변경
UPDATE users 
SET role = 'staff', facility_id = 'FACILITY_001'
WHERE email = 'staff@example.com';

-- admin으로 변경
UPDATE users 
SET role = 'admin'
WHERE email = 'admin@example.com';
```

### 3. 직원 데이터에 facility_id 설정
```sql
-- 특정 직원들을 특정 시설에 할당
UPDATE employees 
SET facility_id = 'FACILITY_001'
WHERE employee_code IN ('EMP001', 'EMP002', 'EMP003');

UPDATE employees 
SET facility_id = 'FACILITY_002'
WHERE employee_code IN ('EMP004', 'EMP005');
```

## 동작 방식

### Admin 사용자
- 모든 직원 목록을 볼 수 있음
- 모든 출퇴근 기록에 접근 가능
- 모든 직원의 출퇴근 처리가 가능

### Staff 사용자
- 자신의 facility_id와 일치하는 직원만 볼 수 있음
- 해당 직원들의 출퇴근 기록에만 접근 가능
- 해당 직원들의 출퇴근 처리만 가능

### 일반 사용자
- 직원 목록에 접근할 수 없음

## 시설 ID 예시
- FACILITY_001: 본사
- FACILITY_002: 지점A
- FACILITY_003: 지점B

## 주의사항
1. facility_id는 대소문자를 구분합니다
2. 새로운 직원을 추가할 때는 반드시 facility_id를 설정해야 합니다
3. staff 사용자는 자신의 facility_id와 일치하는 직원만 관리할 수 있습니다
4. RLS 정책이 데이터베이스 레벨에서 접근을 제어하므로 보안이 보장됩니다 