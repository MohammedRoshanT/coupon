import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { qr_token } = body

    if (!qr_token) {
      return NextResponse.json({ success: false, message: 'QR token is missing' }, { status: 400 })
    }

    // 1. Authenticate the canteen admin scanning the QR
    const supabaseServer = await createServerClient()
    const { data: { user }, error: authError } = await supabaseServer.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 })
    }

    // 2. Initialize Service Role Client for bypassing RLS during scan updates
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json({ success: false, message: 'Server configuration error' }, { status: 500 })
    }

    const supabaseAdmin = createAdminClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })

    const todayStr = new Date().toLocaleDateString('en-CA')

    // --- CHECK 1: daily_qr table (Hosteler Meal) ---
    const { data: dailyQrData } = await supabaseAdmin
      .from('daily_qr')
      .select('*')
      .eq('qr_token', qr_token)
      .eq('date', todayStr)
      .single()

    if (dailyQrData) {
      // It's a hosteler daily QR
      const studentId = dailyQrData.user_id
      
      const { data: studentProfile } = await supabaseAdmin
        .from('profiles')
        .select('*')
        .eq('id', studentId)
        .single()
        
      if (!studentProfile) {
        return NextResponse.json({ success: false, message: 'Student profile not found' }, { status: 404 })
      }

      // Check current time and active meal slots
      const { data: activeSlots } = await supabaseAdmin
        .from('meal_slots')
        .select('*')
        .eq('college_id', studentProfile.college_id)
        .eq('active', true)
        
      if (!activeSlots || activeSlots.length === 0) {
        return NextResponse.json({ success: false, message: 'No active meal slots right now' }, { status: 400 })
      }

      const now = new Date()
      const currentHours = now.getHours()
      const currentMinutes = now.getMinutes()
      const currentTimeStr = `${currentHours.toString().padStart(2, '0')}:${currentMinutes.toString().padStart(2, '0')}:00`

      const currentSlot = activeSlots.find(slot => {
        return currentTimeStr >= slot.start_time && currentTimeStr <= slot.end_time
      })

      if (!currentSlot) {
        return NextResponse.json({ success: false, message: 'No meal slot is currently active' }, { status: 400 })
      }

      // Check if already scanned for this slot today
      const { data: existingAttendance } = await supabaseAdmin
        .from('meal_attendance')
        .select('*')
        .eq('user_id', studentId)
        .eq('meal_slot_id', currentSlot.id)
        .eq('date', todayStr)
        .single()

      if (existingAttendance) {
        return NextResponse.json({ success: false, message: 'Already scanned for this slot' }, { status: 400 })
      }

      // Insert attendance
      const { error: insertError } = await supabaseAdmin
        .from('meal_attendance')
        .insert({
          user_id: studentId,
          meal_slot_id: currentSlot.id,
          date: todayStr,
          scanned_at: new Date().toISOString(),
          status: 'present',
          scanned_by: user.id
        })

      if (insertError) {
        return NextResponse.json({ success: false, message: 'Failed to record attendance' }, { status: 500 })
      }

      return NextResponse.json({
        success: true,
        type: 'hosteler_meal',
        student_name: studentProfile.full_name,
        slot_name: currentSlot.name.replace('_', ' ')
      })
    }

    // --- CHECK 2: snack_orders table ---
    console.log('Checking snack_orders for token:', qr_token)
    const { data: snackOrder, error: snackError } = await supabaseAdmin
      .from('snack_orders')
      .select('*, profiles!snack_orders_user_id_fkey(full_name), snack_stock(snack_item_id)')
      .eq('qr_token', qr_token)
      .single()

    console.log('snackOrder:', snackOrder)
    if (snackError) console.error('snackError:', JSON.stringify(snackError))

    if (snackOrder) {
      if (snackOrder.scanned) {
        return NextResponse.json({ success: false, message: 'Already scanned' }, { status: 400 })
      }

      // get snack item details
      let itemName = 'Unknown Snack'
      if (snackOrder.snack_stock?.snack_item_id) {
        const { data: snackItem } = await supabaseAdmin
          .from('snack_items')
          .select('name')
          .eq('id', snackOrder.snack_stock.snack_item_id)
          .single()
        if (snackItem) itemName = snackItem.name
      }

      // Update scanned status
      const { error: updateError } = await supabaseAdmin
        .from('snack_orders')
        .update({ scanned: true, scanned_at: new Date().toISOString(), scanned_by: user.id })
        .eq('id', snackOrder.id)

      if (updateError) {
        return NextResponse.json({ success: false, message: 'Failed to update snack order' }, { status: 500 })
      }

      return NextResponse.json({
        success: true,
        type: 'snack_order',
        student_name: snackOrder.profiles?.full_name || 'Unknown Student',
        item_name: itemName,
        quantity: snackOrder.quantity
      })
    }

    // --- CHECK 3: orders table (Day Scholar Meal) ---
    const { data: mealOrder } = await supabaseAdmin
      .from('orders')
      .select('*, profiles!orders_user_id_fkey(full_name), meal_item_stock(meal_item_id)')
      .eq('qr_token', qr_token)
      .single()

    if (mealOrder) {
      if (mealOrder.scanned) {
        return NextResponse.json({ success: false, message: 'Already scanned' }, { status: 400 })
      }

      // get meal item details
      let itemName = 'Unknown Meal'
      if (mealOrder.meal_item_stock?.meal_item_id) {
        const { data: mealItem } = await supabaseAdmin
          .from('meal_items')
          .select('name')
          .eq('id', mealOrder.meal_item_stock.meal_item_id)
          .single()
        if (mealItem) itemName = mealItem.name
      }

      // Update scanned status
      const { error: updateError } = await supabaseAdmin
        .from('orders')
        .update({ scanned: true, scanned_at: new Date().toISOString(), scanned_by: user.id })
        .eq('id', mealOrder.id)

      if (updateError) {
        return NextResponse.json({ success: false, message: 'Failed to update meal order' }, { status: 500 })
      }

      return NextResponse.json({
        success: true,
        type: 'day_scholar_meal',
        student_name: mealOrder.profiles?.full_name || 'Unknown Student',
        item_name: itemName
      })
    }

    // --- CHECK 4: Not found anywhere ---
    return NextResponse.json({ success: false, message: 'Invalid QR code' }, { status: 404 })

  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message || 'Internal Server Error' }, { status: 500 })
  }
}
