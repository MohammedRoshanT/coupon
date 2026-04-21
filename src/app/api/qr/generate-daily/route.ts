import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import crypto from 'crypto'

export async function GET() {
  try {
    const supabaseUser = await createServerClient()

    // 1. Get current authenticated user
    const { data: { user }, error: authError } = await supabaseUser.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 2. Fetch or create Daily QR
    const date = new Date().toLocaleDateString('en-CA') // YYYY-MM-DD local time independent format

    const { data: existingQr, error: fetchError } = await supabaseUser
      .from('daily_qr')
      .select('qr_token')
      .eq('user_id', user.id)
      .eq('date', date)
      .single()

    if (existingQr) {
      // 3a. Return existing QR
      return NextResponse.json({ qr_token: existingQr.qr_token }, { status: 200 })
    }

    if (fetchError && fetchError.code !== 'PGRST116') {
      // PGRST116 corresponds to 0 rows returned, which is handled in the 'not exists' logic
      return NextResponse.json({ error: 'Database fetch error' }, { status: 500 })
    }

    // 3b. Generate new QR token
    const randomString = crypto.randomBytes(4).toString('hex')
    const qr_token = `${user.id}-${date}-${randomString}`

    // 4. Setup admin client for inserting
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !supabaseServiceKey) {
       return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
    }

    const supabaseAdmin = createAdminClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    // 5. Insert into daily_qr using Admin
    const { error: insertError } = await supabaseAdmin
      .from('daily_qr')
      .insert({
        user_id: user.id,
        date: date,
        qr_token: qr_token
      })

    if (insertError) {
      return NextResponse.json({ error: insertError.message || 'Failed to insert newly generated QR' }, { status: 500 })
    }

    return NextResponse.json({ qr_token }, { status: 200 })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 })
  }
}
