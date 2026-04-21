export type Role = 'super_admin' | 'canteen_admin' | 'hosteler' | 'day_scholar'

export type PaymentStatus = 'pending' | 'paid' | 'failed'

export type MealSlotName = 'breakfast' | 'lunch' | 'tea_snacks' | 'dinner'

export type OrderType = 'meal' | 'snack'

export type AttendanceStatus = 'present' | 'absent'

export interface College {
  id: string
  name: string
  email_domain: string
  active: boolean
  created_at: string
}

export interface Profile {
  id: string
  college_id: string
  full_name: string
  email: string
  role: Role
  active: boolean
  created_at: string
}

export interface MealSlot {
  id: string
  college_id: string
  name: MealSlotName
  start_time: string
  end_time: string
  active: boolean
}

export interface SlotStock {
  id: string
  meal_slot_id: string
  date: string
  total_stock: number
  remaining_stock: number
  is_closed: boolean
  created_at: string
}

export interface Subscription {
  id: string
  user_id: string
  college_id: string
  start_date: string
  end_date: string
  amount: number
  payment_status: PaymentStatus
  razorpay_order_id: string
  razorpay_payment_id: string
  created_at: string
}

export interface DailyQR {
  id: string
  user_id: string
  date: string
  qr_token: string
  created_at: string
}

export interface MealAttendance {
  id: string
  user_id: string
  meal_slot_id: string
  date: string
  scanned_at: string
  status: AttendanceStatus
  scanned_by: string
}

export interface Order {
  id: string
  user_id: string
  slot_stock_id: string
  order_type: OrderType
  amount: number
  payment_status: PaymentStatus
  razorpay_order_id: string
  razorpay_payment_id: string
  qr_token: string
  scanned: boolean
  scanned_at: string
  scanned_by: string
  created_at: string
}