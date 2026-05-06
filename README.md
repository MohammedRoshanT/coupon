# Digital Canteen Coupon System

## Overview

The Digital Canteen Coupon System is a comprehensive, role-based web application built with Next.js, Tailwind CSS, and Supabase designed to fully digitize college mess and canteen operations. It streamlines the dining experience by offering distinct dashboards for Super Admins, Canteen Admins, Hostelers, and Day Scholars, enabling seamless management of meal slots, daily stock, and user subscriptions. Utilizing integrated Razorpay for secure payments and a built-in QR code generation and scanning system, the platform allows hostelers to access meals via daily digital tokens and day scholars to pre-book and pay for specific meals and snacks on-demand, all while providing real-time analytics and automated attendance tracking for administrators.

## Tech Stack

- **Next.js 15** (App Router)
- **Supabase** (Auth + PostgreSQL)
- **Tailwind CSS**
- **Razorpay**
- **qrcode.react**
- **html5-qrcode**

## Key Features by Role

### Super Admin
- Manage all colleges and canteen administrators.
- Create canteen admin accounts through authenticated admin workflows.
- Maintain platform-level access without a college assignment.

### Canteen Admin
- Manage meal slots, meal items, and snack items.
- Configure daily stock, stock availability, and closure status.
- Monitor meal attendance and order fulfillment using live scanner support.
- View auto-refreshing statistics and analytics for canteen operations.

### Hosteler
- Pay monthly mess subscriptions with integrated Razorpay payments.
- Generate a daily QR pass for meal access.
- Access meals using a secure, auto-generated digital token.
- Place snack orders and track active subscriptions.

### Day Scholar
- Browse meal items and snack items grouped by categories.
- Pay per meal and snack using Razorpay on-demand.
- Receive QR tokens for paid orders.
- View order history with same-day filtering and status tracking.

## Database Architecture

Core tables used by the application:

- `colleges` — college details, email domains, and active status.
- `profiles` — user profiles, roles, college association, and account activity.
- `meal_slots` — scheduled meal periods such as breakfast, lunch, tea snacks, and dinner.
- `meal_items` — meal menu items tied to a meal slot and college.
- `meal_item_stock` — daily meal stock tracking with remaining inventory and closure status.
- `snack_items` — snack catalog items grouped by category with pricing.
- `snack_stock` — daily snack stock tracking for canteen availability.
- `subscriptions` — hosteler subscription records, payment status, and Razorpay order links.
- `daily_qr` — daily QR tokens generated per hosteler for secure meal access.
- `meal_attendance` — scanned attendance records for hostelers by meal slot.
- `orders` — meal orders, payment and QR tracking, and scan fulfillment state.
- `snack_orders` — snack orders with stock linkage, payment status, and scan verification.

## Local Development Setup

1. Clone the repository:

```bash
git clone https://github.com/your-org/digital-coupon-system.git
cd digital-coupon-system
```

2. Install dependencies:

```bash
npm install
```

3. Create a `.env.local` file at the project root and add your Supabase and Razorpay keys:

```env
NEXT_PUBLIC_SUPABASE_URL=<your-supabase-url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-supabase-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<your-supabase-service-role-key>
NEXT_PUBLIC_RAZORPAY_KEY_ID=<your-razorpay-key-id>
RAZORPAY_KEY_ID=<your-razorpay-key-id>
RAZORPAY_KEY_SECRET=<your-razorpay-key-secret>
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

4. Start the development server:

```bash
npm run dev
```

5. Open the app:

```text
http://localhost:3000
```

## Deployment

This project is optimized for deployment on **Vercel**. Before deploying, update the following settings:

- `NEXT_PUBLIC_SITE_URL` to your production URL.
- Supabase Redirect URIs in your Supabase dashboard to match your deployed site.

---

## Notes

- The app uses strict Supabase RLS and a `get_my_role()` security-definer function to handle policy logic safely.
- Razorpay integration is configured for secure order creation and payment verification.
- QR generation and scanning are handled through `qrcode.react` and `html5-qrcode` respectively.
