## Important Note for AI Agents
This file is the single source of truth for this project.
Whenever you add a new API route, table, component pattern, 
or integration, update this AGENTS.md file at the end of your response.
Keep it always in sync with the actual codebase.
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

### Supabase Setup
- RLS enabled on all tables
- get_my_role() security definer function created to avoid RLS recursion
- Always use get_my_role() instead of querying profiles inside policies
- Never query profiles table inside a profiles RLS policy

### Roles
- super_admin — platform owner, no college_id
- canteen_admin — manages one college canteen, has college_id
- hosteler — monthly mess fee, daily QR, has college_id
- day_scholar — pays per meal, has college_id

### Database Tables
- colleges (id, name, email_domain, active, created_at)
- profiles (id, college_id, full_name, email, role, active, created_at)
- meal_slots (id, college_id, name, start_time, end_time, active)
  - name: 'breakfast' | 'lunch' | 'tea_snacks' | 'dinner'
- meal_items (id, college_id, meal_slot_id, name, price, active)
- meal_item_stock (id, meal_item_id, date, total_stock, remaining_stock, is_closed)
- snack_items (id, college_id, name, category, price, active)
- snack_stock (id, snack_item_id, date, total_stock, remaining_stock, is_closed)
- subscriptions (id, user_id, college_id, start_date, end_date, amount, payment_status, razorpay_order_id, razorpay_payment_id)
- daily_qr (id, user_id, date, qr_token)
- meal_attendance (id, user_id, meal_slot_id, date, scanned_at, status, scanned_by)
- orders (id, user_id, meal_item_stock_id, order_type, quantity, amount, payment_status, razorpay_order_id, razorpay_payment_id, qr_token, scanned, scanned_at, scanned_by)
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

## Pages Built
- src/app/auth/login/page.tsx — Login with role based redirect
- src/app/auth/register/page.tsx — Register with college email validation
- src/app/dashboard/super-admin/page.tsx — Manage colleges and canteen admins
- src/app/dashboard/canteen-admin/page.tsx — Manage meal slots, meal items, snack items, daily stock
- src/app/dashboard/hosteler/page.tsx — Hosteler portal for subscriptions, daily QR passes, and snack orders
- src/app/dashboard/day-scholar/page.tsx — Browse meal items and snacks, pay via Razorpay, get QR token, view order history

## API Routes Built
- POST /api/admin/create-canteen-admin — Creates canteen admin using service role key
- POST /api/payments/create-order — Creates Razorpay order
- POST /api/payments/verify-payment — Verifies Razorpay payment signature
- GET /api/qr/generate-daily — Auto-generates or retrieves today's QR securely bypassing RLS
- POST /api/qr/verify — Verifies scanned QR token for hosteler meals, snack orders, and day scholar orders using service role bypass

## Razorpay Integration
- Use NEXT_PUBLIC_RAZORPAY_KEY_ID for client side
- Use RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET for server side
- Load Razorpay script dynamically in client components
- Payment flow:
  1. Client calls POST /api/payments/create-order with amount
  2. Server creates Razorpay order and returns order_id
  3. Client opens Razorpay checkout with order_id
  4. On success client calls POST /api/payments/verify-payment
  5. Server verifies signature and updates payment_status to 'paid'
- API routes needed:
  - POST /api/payments/create-order
  - POST /api/payments/verify-payment
    - Body includes type: 'subscription' | 'order' | 'snack_order'
    - Updates correct table based on type, including qr_token for orders and snack_orders

## QR Codes
- Generate using: import QRCode from 'qrcode.react'
- Scan using: import { Html5QrcodeScanner } from 'html5-qrcode'
- Hosteler daily QR stored in daily_qr table, generated once per day
- QR token format: userId-date-randomString
- Order QR stored in qr_token field of orders and snack_orders tables

## Roles and Access
- super_admin — no college_id, manages all colleges and canteen admins
- canteen_admin — has college_id, manages their canteen only
- hosteler — has college_id, pays monthly mess fee, gets daily QR
- day_scholar — has college_id, pays per meal item and snack

## Day Scholar Notes
- Day scholars only order from `snack_items` grouped by category ('meals', 'drinks', 'snacks').
- `orders` (meal table) logic has been removed from their dashboard.
- QR token format: DS-userId-timestamp
- Stock deduction handled in /api/payments/verify-payment (snack_orders table)
- Orders filtered by created_at date range for today

## Important Rules for AI Agents
- Always update this file when adding new routes, tables, or patterns
- Never use slot_stock table — it was dropped, use meal_item_stock instead
- Never query profiles inside a profiles RLS policy — use get_my_role()
- Always filter data by college_id for canteen_admin and student roles
- Use service role key only in API routes, never in client components
- When joining `profiles` from a table with multiple foreign keys to profiles (e.g. `user_id` and `scanned_by` in `orders`/`snack_orders`), always explicitly state the foreign key to avoid PostgREST PGRST201 ambiguous relation errors. Example: `profiles!snack_orders_user_id_fkey(full_name)`
