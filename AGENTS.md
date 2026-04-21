## Project: Digital Canteen Coupon System

### Tech Stack
- Next.js 15 App Router with TypeScript
- Supabase (database + auth)
- Tailwind CSS
- Razorpay (payments)

### Project Structure
- src/app/ — App Router pages
- src/components/ — Reusable components
- src/lib/supabase/client.ts — Browser Supabase client
- src/lib/supabase/server.ts — Server Supabase client
- src/types/index.ts — All TypeScript interfaces
- src/lib/utils/index.ts — Utility functions

### Supabase Rules
- Always import browser client from '@/lib/supabase/client'
- Always import server client from '@/lib/supabase/server'
- Never use service role key on client side
- All queries must respect RLS
- Use get_my_role() function for role checks, never query profiles inside a profiles policy
- Always filter data by college_id for canteen admin and students

### Roles
- super_admin — platform owner, no college_id
- canteen_admin — manages one college canteen, has college_id
- hosteler — monthly mess fee, daily QR, has college_id
- day_scholar — pays per meal, has college_id

### Database Tables
- colleges (id, name, email_domain, active)
- profiles (id, college_id, full_name, email, role, active)
- meal_slots (id, college_id, name, start_time, end_time, active)
  - name: 'breakfast' | 'lunch' | 'tea_snacks' | 'dinner'
- slot_stock (id, meal_slot_id, date, total_stock, remaining_stock, is_closed)
- subscriptions (id, user_id, college_id, start_date, end_date, amount, payment_status, razorpay_order_id, razorpay_payment_id)
- daily_qr (id, user_id, date, qr_token)
- meal_attendance (id, user_id, meal_slot_id, date, scanned_at, status, scanned_by)
- orders (id, user_id, slot_stock_id, order_type, amount, payment_status, razorpay_order_id, razorpay_payment_id, qr_token, scanned, scanned_at, scanned_by)
  - order_type: 'meal' | 'snack'
- snack_items (id, college_id, name, price, active)
- snack_stock (id, snack_item_id, date, total_stock, remaining_stock, is_closed)
- snack_orders (id, user_id, snack_stock_id, quantity, amount, payment_status, razorpay_order_id, razorpay_payment_id, qr_token, scanned, scanned_at, scanned_by)
### Auth Rules
- Students self-register with college email only
- College email domain validated against colleges table
- Canteen admin created by super admin only
- Super admin created manually via Supabase dashboard
- After login, redirect based on role to /dashboard/[role]

### Payments
- Razorpay Test Mode during development
- Hostelers pay monthly subscription
- Day scholars pay per meal/snack
- Extra snacks for hostelers also go through orders table

### UI Rules
- Purple-600 as primary color
- Dark mode support using Tailwind dark: classes
- No external component libraries
- Use 'use client' only when needed
- Keep pages clean and minimal
