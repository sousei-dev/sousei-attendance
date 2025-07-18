import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
})

// 데이터베이스 타입 정의
export interface Employee {
  id: string
  last_name: string
  first_name: string
  first_name_kana: string
  last_name_kana: string
  gender: string
  birthday: string
  join_date: string
  category_1: string
  category_2: string
  employee_code: string
  is_active: boolean
  salary_type: 'hourly' | 'monthly'
  pay_period_end_type: string
  facility_id?: string
  company_id?: string
}

export interface AttendanceRecord {
  id: string
  employee_id: string
  date: string
  check_in: string | null
  check_out: string | null
  status: 'present' | 'late' | 'early-leave' | 'absent'
  scheduled_check_in: string | null
  scheduled_check_out: string | null
  break_time: string | null
  is_night_shift?: boolean
  created_at: string
  updated_at: string
}

export interface User {
  id: string
  email: string
  role: 'admin' | 'user' | 'staff'
  facility_id?: string
  created_at: string
}

export interface AuthUser {
  id: string
  email: string
  role: string
  facility_id?: string
  company_id?: string
}

export interface Facility {
  id: string
  name: string
}

export interface Company {
  id: string
  name: string
  created_at: string
  note: string
}

export interface Database {
  public: {
    Tables: {
      employees: {
        Row: Employee
        Insert: Omit<Employee, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<Employee, 'id' | 'created_at' | 'updated_at'>>
      }
      attendance_records: {
        Row: AttendanceRecord
        Insert: Omit<AttendanceRecord, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<AttendanceRecord, 'id' | 'created_at' | 'updated_at'>>
      }
      users: {
        Row: User
        Insert: Omit<User, 'id' | 'created_at'>
        Update: Partial<Omit<User, 'id' | 'created_at'>>
      }
      facilities: {
        Row: Facility
        Insert: Omit<Facility, 'created_at' | 'updated_at'>
        Update: Partial<Omit<Facility, 'created_at' | 'updated_at'>>
      }
    }
  }
}
