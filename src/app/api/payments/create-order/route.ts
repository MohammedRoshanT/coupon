import { NextResponse } from 'next/server'
import Razorpay from 'razorpay'

export async function POST(req: Request) {
  try {
    const { amount, receipt = 'receipt' } = await req.json()
    
    const key_id = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID
    const key_secret = process.env.RAZORPAY_KEY_SECRET

    if (!key_id || !key_secret) {
      return NextResponse.json({ error: 'Razorpay credentials not configured' }, { status: 500 })
    }

    const razorpay = new Razorpay({ key_id, key_secret })

   const options = {
    amount: Math.round(amount * 100),
    currency: 'INR',
    receipt: receipt.slice(0, 4) // trim to 40 chars
}
    
    const order = await razorpay.orders.create(options)
    return NextResponse.json({ orderId: order.id }, { status: 200 })
 } catch (error: any) {
    console.error('Razorpay error:', error)
    return NextResponse.json({ error: error.message, details: JSON.stringify(error) }, { status: 500 })
  
  }
}
