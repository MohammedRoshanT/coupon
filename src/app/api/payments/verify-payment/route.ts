import { NextResponse } from 'next/server'
import crypto from 'crypto'

export async function POST(req: Request) {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = await req.json()
    const secret = process.env.RAZORPAY_KEY_SECRET

    if (!secret) {
      return NextResponse.json({ success: false, error: 'Razorpay secret not configured' }, { status: 500 })
    }

    const body = razorpay_order_id + '|' + razorpay_payment_id
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(body.toString())
      .digest('hex')

    const isAuthentic = expectedSignature === razorpay_signature

    if (isAuthentic) {
      return NextResponse.json({ success: true, message: 'Payment verified successfully' }, { status: 200 })
    } else {
      return NextResponse.json({ success: false, error: 'Invalid signature. Payment verification failed.' }, { status: 400 })
    }
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
