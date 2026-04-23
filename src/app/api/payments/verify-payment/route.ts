import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { createClient as createAdminClient } from '@supabase/supabase-js'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, type, record_id, qr_token } = body
    const secret = process.env.RAZORPAY_KEY_SECRET

    if (!secret) {
      return NextResponse.json({ success: false, error: 'Razorpay secret not configured' }, { status: 500 })
    }

    const data = razorpay_order_id + '|' + razorpay_payment_id
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(data.toString())
      .digest('hex')

    const isAuthentic = expectedSignature === razorpay_signature

    if (!isAuthentic) {
      return NextResponse.json({ success: false, error: 'Invalid signature. Payment verification failed.' }, { status: 400 })
    }

    // Initialize Service Role Client for bypassing RLS during payment updates
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json({ success: false, error: 'Server configuration error' }, { status: 500 })
    }

    const supabaseAdmin = createAdminClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })

    // Update the corresponding table based on 'type'
    if (type === 'snack_order') {
      const { error } = await supabaseAdmin
        .from('snack_orders')
        .update({
          payment_status: 'paid',
          razorpay_order_id,
          razorpay_payment_id,
          qr_token: qr_token
        })
        .eq('id', record_id)

      if (error) throw error

      const { data: orderData } = await supabaseAdmin
        .from('snack_orders')
        .select('snack_stock_id, quantity')
        .eq('id', record_id)
        .single()

      if (orderData) {
        const { data: stockData } = await supabaseAdmin
          .from('snack_stock')
          .select('remaining_stock')
          .eq('id', orderData.snack_stock_id)
          .single()

        if (stockData) {
          await supabaseAdmin
            .from('snack_stock')
            .update({ remaining_stock: Math.max(0, stockData.remaining_stock - orderData.quantity) })
            .eq('id', orderData.snack_stock_id)
        }
      }
    } else if (type === 'subscription') {
      const { error } = await supabaseAdmin
        .from('subscriptions')
        .update({
          payment_status: 'paid',
          razorpay_order_id,
          razorpay_payment_id,
        })
        .eq('id', record_id)

      if (error) throw error
    } else if (type === 'order') { // Day Scholar Meals or Extra Meals
      const { error } = await supabaseAdmin
        .from('orders')
        .update({
          payment_status: 'paid',
          razorpay_order_id,
          razorpay_payment_id,
          qr_token: qr_token
        })
        .eq('id', record_id)

      if (error) throw error

      const { data: orderData } = await supabaseAdmin
        .from('orders')
        .select('meal_item_stock_id, quantity')
        .eq('id', record_id)
        .single()

      if (orderData) {
        const { data: stockData } = await supabaseAdmin
          .from('meal_item_stock')
          .select('remaining_stock')
          .eq('id', orderData.meal_item_stock_id)
          .single()

        if (stockData) {
          await supabaseAdmin
            .from('meal_item_stock')
            .update({ remaining_stock: Math.max(0, stockData.remaining_stock - orderData.quantity) })
            .eq('id', orderData.meal_item_stock_id)
        }
      }
    } else {
      return NextResponse.json({ success: false, error: 'Invalid order type' }, { status: 400 })
    }

    return NextResponse.json({ success: true, message: 'Payment verified successfully' }, { status: 200 })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
