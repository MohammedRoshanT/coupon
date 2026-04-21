'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Profile, Subscription, DailyQR, MealSlot, MealAttendance, SnackItem, SnackStock, SnackOrder } from '@/types'
import { QRCodeSVG } from 'qrcode.react'

type SnackOrderWithDetails = SnackOrder & {
  snack_stock?: {
    snack_items?: { name: string } | null
  } | null
}

export default function HostelerDashboard() {
  const router = useRouter()
  const supabase = createClient()

  // State
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [profile, setProfile] = useState<Profile | null>(null)

  // 1. Subscription
  const [subStatus, setSubStatus] = useState<'active' | 'expired' | 'none'>('none')
  const [activeSub, setActiveSub] = useState<Subscription | null>(null)
  const [processingSub, setProcessingSub] = useState(false)

  // 2 & 3. Meals
  const [todayQr, setTodayQr] = useState<DailyQR | null>(null)
  const [mealSlots, setMealSlots] = useState<MealSlot[]>([])
  const [attendances, setAttendances] = useState<MealAttendance[]>([])

  // 4. Snacks
  const [availableSnacks, setAvailableSnacks] = useState<(SnackItem & { stockId: string, remaining: number })[]>([])
  const [snackQuantities, setSnackQuantities] = useState<{ [key: string]: number }>({})
  const [processingSnackId, setProcessingSnackId] = useState<string | null>(null)

  // 5. Snack History
  const [snackOrders, setSnackOrders] = useState<SnackOrderWithDetails[]>([])

  // Time metrics
  const todayStr = new Date().toLocaleDateString('en-CA')

  const loadData = async () => {
    setLoading(true)
    setError('')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()
      
      if (profileError || !profileData) throw new Error('Profile not found')
      const p = profileData as Profile
      setProfile(p)

      const collegeId = p.college_id
      if (!collegeId) throw new Error('No college assigned')

      // SUBSCRIPTIONS
      const { data: subsData } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('user_id', user.id)
        .eq('payment_status', 'paid')
        .order('end_date', { ascending: false })
      
      const subs = (subsData || []) as Subscription[]
      let currentStatus: 'active'|'expired'|'none' = 'none'
      let cSub = null
      if (subs.length > 0) {
        cSub = subs[0]
        if (new Date(cSub.end_date) >= new Date(todayStr)) {
          currentStatus = 'active'
        } else {
          currentStatus = 'expired'
        }
      }
      setSubStatus(currentStatus)
      setActiveSub(cSub)

      // QR CODE (Auto-gen if active)
      let currentQr = null
      if (currentStatus === 'active') {
        try {
          const qrRes = await fetch('/api/qr/generate-daily')
          if (qrRes.ok) {
            const qrParsed = await qrRes.json()
            if (qrParsed.qr_token) {
              currentQr = { 
                id: 'api-gen', 
                user_id: user.id, 
                date: todayStr, 
                qr_token: qrParsed.qr_token, 
                created_at: new Date().toISOString() 
              } as DailyQR
            }
          } else {
            console.error('QR Generate Error:', await qrRes.text())
            currentQr = { id: 'error', user_id: user.id, date: todayStr, qr_token: 'error', created_at: '' } as DailyQR
          }
        } catch (e: any) {
          console.error(e)
          currentQr = { id: 'error', user_id: user.id, date: todayStr, qr_token: 'error', created_at: '' } as DailyQR
        }
      }
      setTodayQr(currentQr)

      // MEAL SLOTS & ATTENDANCE
      const { data: mSlots } = await supabase
        .from('meal_slots')
        .select('*')
        .eq('college_id', collegeId)
        .order('start_time')
      setMealSlots((mSlots || []) as MealSlot[])

      const { data: mAtt } = await supabase
        .from('meal_attendance')
        .select('*')
        .eq('user_id', user.id)
        .eq('date', todayStr)
      setAttendances((mAtt || []) as MealAttendance[])

      // SNACKS & STOCK
      const { data: sItems } = await supabase.from('snack_items').select('*').eq('college_id', collegeId).eq('active', true)
      const snackItems = (sItems || []) as SnackItem[]
      
      let mappedSnacks: (SnackItem & { stockId: string, remaining: number })[] = []
      if (snackItems.length > 0) {
        const sIds = snackItems.map(s => s.id)
        const { data: sStocksData } = await supabase
          .from('snack_stock')
          .select('*')
          .eq('date', todayStr)
          .eq('is_closed', false)
          .in('snack_item_id', sIds)
        
        const stocks = (sStocksData || []) as SnackStock[]
        
        mappedSnacks = snackItems.map(item => {
          const stock = stocks.find(st => st.snack_item_id === item.id)
          if (stock && stock.remaining_stock > 0) {
            return { ...item, stockId: stock.id, remaining: stock.remaining_stock }
          }
          return null
        }).filter(Boolean) as any
      }
      setAvailableSnacks(mappedSnacks)

      // SNACK ORDERS TODAY
      const { data: sOrdersData } = await supabase
        .from('snack_orders')
        .select('*, snack_stock(snack_items(name))')
        .eq('user_id', user.id)
        .eq('payment_status', 'paid')
        .gte('created_at', `${todayStr}T00:00:00Z`)
        .lte('created_at', `${todayStr}T23:59:59Z`)
        .order('created_at', { ascending: false })
      
      setSnackOrders((sOrdersData || []) as SnackOrderWithDetails[])

    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const loadRazorpaySDK = (): Promise<boolean> => {
    return new Promise((resolve) => {
      if ((window as any).Razorpay) return resolve(true)
      const script = document.createElement('script')
      script.src = 'https://checkout.razorpay.com/v1/checkout.js'
      script.onload = () => resolve(true)
      script.onerror = () => resolve(false)
      document.body.appendChild(script)
    })
  }

  const handlePayMessFee = async () => {
    if (!profile) return
    setProcessingSub(true)
    try {
      const isLoaded = await loadRazorpaySDK()
      if (!isLoaded) throw new Error('Razorpay initialization failed. Check your connection.')

      const amount = 3000

      const rOrder = await fetch('/api/payments/create-order', {
        method: 'POST',
        body: JSON.stringify({ amount, receipt: `fee_${profile.id}` }),
        headers: { 'Content-Type': 'application/json' }
      }).then(r => r.json())

      if (rOrder.error) throw new Error(rOrder.error)

      const options = {
        key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
        amount: amount * 100,
        currency: "INR",
        name: "Digital Canteen System",
        description: "Monthly Mess Fee",
        order_id: rOrder.orderId,
        handler: async function (response: any) {
          try {
            const verifyReq = await fetch('/api/payments/verify-payment', {
              method: 'POST',
              body: JSON.stringify(response),
              headers: { 'Content-Type': 'application/json' }
            })
            const verify = await verifyReq.json()
            
            if (verify.success) {
              const start = new Date()
              const end = new Date()
              end.setDate(start.getDate() + 30) // 30 days subscription

              await supabase.from('subscriptions').insert({
                user_id: profile.id,
                college_id: profile.college_id,
                start_date: start.toISOString().split('T')[0],
                end_date: end.toISOString().split('T')[0],
                amount,
                payment_status: 'paid',
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id
              })
              await loadData()
            } else {
              alert('Payment Verification Failed!')
            }
          } catch (e: any) {
             alert(e.message)
          }
        },
        prefill: {
          name: profile.full_name,
          email: profile.email
        },
        theme: { color: "#9333ea" }
      }
      
      const rzp = new (window as any).Razorpay(options)
      rzp.on('payment.failed', function(res: any) {
        alert(res.error.description)
      })
      rzp.open()
    } catch (err: any) {
      alert(err.message)
      setError(err.message)
    } finally {
      setProcessingSub(false)
    }
  }

  const handlePaySnack = async (snack: typeof availableSnacks[0]) => {
    if (!profile) return
    const quantity = snackQuantities[snack.id] || 1
    if (quantity < 1 || quantity > snack.remaining) return alert('Invalid quantity')

    setProcessingSnackId(snack.id)
    try {
      const isLoaded = await loadRazorpaySDK()
      if (!isLoaded) throw new Error('Razorpay failed to load.')

      const amount = snack.price * quantity

      const rOrder = await fetch('/api/payments/create-order', {
        method: 'POST',
        body: JSON.stringify({ amount, receipt: `snack_${snack.id}` }),
        headers: { 'Content-Type': 'application/json' }
      }).then(r => r.json())
      if (rOrder.error) throw new Error(rOrder.error)

      const options = {
        key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
        amount: amount * 100,
        currency: "INR",
        name: "Canteen Snacks",
        description: `Order: ${quantity}x ${snack.name}`,
        order_id: rOrder.orderId,
        handler: async function (response: any) {
          const verifyReq = await fetch('/api/payments/verify-payment', {
            method: 'POST',
            body: JSON.stringify(response),
            headers: { 'Content-Type': 'application/json' }
          })
          const verify = await verifyReq.json()
          if (verify.success) {
            const randStr = Math.random().toString(36).substring(7)
            const token = `SNK-${profile.id}-${randStr}`
            
            await supabase.from('snack_orders').insert({
              user_id: profile.id,
              snack_stock_id: snack.stockId,
              quantity,
              amount,
              payment_status: 'paid',
              qr_token: token,
              scanned: false,
            })
            // Optionally deduction of local remaining_stock or trigger function. Postgres handles remainder dynamically via function ideally, but we will reload.
            setSnackQuantities(prev => ({...prev, [snack.id]: 1}))
            await loadData()
          } else {
            alert('Verification Failed')
          }
        },
        prefill: { name: profile.full_name, email: profile.email },
        theme: { color: "#9333ea" }
      }

      const rzp = new (window as any).Razorpay(options)
      rzp.open()
    } catch (err: any) {
      alert(err.message)
    } finally {
      setProcessingSnackId(null)
    }
  }

  const checkIsActiveNow = (start: string, end: string) => {
    const now = new Date()
    const currentMins = now.getHours() * 60 + now.getMinutes()
    const [h1, m1] = start.split(':').map(Number)
    const [h2, m2] = end.split(':').map(Number)
    return currentMins >= (h1*60+m1) && currentMins <= (h2*60+m2)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-50 dark:bg-neutral-900 flex justify-center items-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-600"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 p-6 md:p-8 pb-32">
      <div className="max-w-5xl mx-auto space-y-8">
        
        {/* Header */}
        <header className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-purple-600 to-purple-400 bg-clip-text text-transparent">
              Hosteler Dashboard
            </h1>
            <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">Hello, {profile?.full_name}</p>
          </div>
          <button
            onClick={async () => { await supabase.auth.signOut(); router.push('/auth/login') }}
            className="px-4 py-2 bg-neutral-200 dark:bg-neutral-800 hover:bg-neutral-300 dark:hover:bg-neutral-700 rounded-md transition-colors text-sm font-medium"
          >
            Logout
          </button>
        </header>

        {error && (
          <div className="p-4 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-md border border-red-200 dark:border-red-800 text-sm">
            {error}
          </div>
        )}

        {/* 1. SUBSCRIPTION SECTION */}
        <section className="bg-white dark:bg-neutral-800 p-6 rounded-xl shadow-sm border border-neutral-200 dark:border-neutral-700">
          <div className="flex flex-col md:flex-row md:justify-between md:items-center">
            <div>
              <h2 className="text-xl font-bold text-neutral-800 dark:text-neutral-100">Mess Subscription</h2>
              <div className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
                Status:{' '}
                <span className={`font-semibold capitalize ${subStatus === 'active' ? 'text-green-600 dark:text-green-400' : 'text-red-500'}`}>
                  {subStatus}
                </span>
                {activeSub && (
                  <span className="ml-2 block md:inline mt-1 md:mt-0">
                    ({activeSub.start_date} to {activeSub.end_date})
                  </span>
                )}
              </div>
            </div>
            {(subStatus === 'expired' || subStatus === 'none') && (
              <div className="mt-4 md:mt-0">
                <button
                  onClick={handlePayMessFee}
                  disabled={processingSub}
                  className="bg-purple-600 hover:bg-purple-700 text-white font-medium px-6 py-2.5 rounded-lg transition-colors shadow-sm disabled:opacity-50 w-full md:w-auto"
                >
                  {processingSub ? 'Processing...' : 'Pay Monthly Fee (₹3000)'}
                </button>
              </div>
            )}
          </div>
        </section>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
          
          {/* LEFT COL: QR & ATTENDANCE */}
          <div className="md:col-span-5 space-y-8">
            
            {/* 2. TODAY'S QR */}
            <section className="bg-white dark:bg-neutral-800 p-6 rounded-xl shadow-sm border border-neutral-200 dark:border-neutral-700 flex flex-col items-center justify-center text-center">
              <h2 className="text-xl font-bold mb-6 text-neutral-800 dark:text-neutral-100">Today's Meal QR Pass</h2>
              {subStatus !== 'active' ? (
                <div className="p-4 bg-red-50 dark:bg-red-900/10 rounded-lg text-red-600 dark:text-red-400 text-sm">
                  Active subscription required to view passes.
                </div>
              ) : todayQr?.qr_token === 'error' ? (
                <div className="text-red-500 text-sm font-semibold">Failed to load or generate QR. Try refreshing.</div>
              ) : !todayQr ? (
                <div className="text-neutral-500 text-sm">Generating QR code...</div>
              ) : (
                <div className="space-y-4 flex flex-col items-center">
                  <div className="p-4 bg-white rounded-xl shadow-sm border border-neutral-200 inline-block">
                    <QRCodeSVG value={todayQr.qr_token} size={180} level="H" />
                  </div>
                  <p className="font-mono text-xs text-neutral-500 break-all">{todayQr.qr_token}</p>
                </div>
              )}
            </section>

            {/* 3. TODAY'S MEAL ATTENDANCE */}
            <section className="bg-white dark:bg-neutral-800 p-6 rounded-xl shadow-sm border border-neutral-200 dark:border-neutral-700">
              <h2 className="text-xl font-bold mb-4 text-neutral-800 dark:text-neutral-100">Meal Timeline</h2>
              {mealSlots.length === 0 ? (
                <p className="text-sm text-neutral-500">No active meal slots mapped.</p>
              ) : (
                <ul className="space-y-4 relative">
                  {mealSlots.map((slot, index) => {
                    const att = attendances.find(a => a.meal_slot_id === slot.id)
                    const isActiveNow = slot.active && checkIsActiveNow(slot.start_time, slot.end_time)
                    return (
                      <li key={slot.id} className="flex relative">
                        <div className="flex flex-col items-center mr-4 relative top-1">
                          <div className={`w-3 h-3 rounded-full flex-shrink-0 ${att?.status === 'present' ? 'bg-green-500' : isActiveNow ? 'bg-purple-500' : 'bg-neutral-300 dark:bg-neutral-600'}`}></div>
                          {index !== mealSlots.length - 1 && <div className="w-[1.5px] h-full bg-neutral-200 dark:bg-neutral-700 my-1 absolute top-3"></div>}
                        </div>
                        <div className="flex-1 pb-2">
                          <div className="flex justify-between items-start">
                            <p className={`font-semibold capitalize ${isActiveNow ? 'text-purple-600 dark:text-purple-400' : 'text-neutral-800 dark:text-neutral-200'}`}>
                              {slot.name.replace('_', ' ')}
                            </p>
                            <span className="text-xs text-neutral-500">{slot.start_time.slice(0, 5)} - {slot.end_time.slice(0, 5)}</span>
                          </div>
                          {att && att.status === 'present' ? (
                            <p className="text-xs font-medium text-green-600 dark:text-green-400 mt-1">✓ Scanned at {new Date(att.scanned_at).toLocaleTimeString()}</p>
                          ) : (
                            <p className="text-xs text-neutral-500 mt-1">{isActiveNow ? 'Currently serving' : 'Not attended'}</p>
                          )}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>
          </div>

          {/* RIGHT COL: SNACKS */}
          <div className="md:col-span-7 space-y-8">
            
            {/* 4. SNACK ORDERING */}
            <section className="bg-white dark:bg-neutral-800 p-6 rounded-xl shadow-sm border border-neutral-200 dark:border-neutral-700">
              <h2 className="text-xl font-bold mb-2 text-neutral-800 dark:text-neutral-100">Buy Extras / Snacks</h2>
              <p className="text-sm text-neutral-500 mb-6">Instantly pay and collect from the counter.</p>
              
              {availableSnacks.length === 0 ? (
                <div className="text-center p-6 border border-neutral-200 dark:border-neutral-700 border-dashed rounded-lg text-neutral-500 text-sm">
                  No snacks available for ordering today.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {availableSnacks.map(snack => {
                    const qty = snackQuantities[snack.id] || 1
                    const total = snack.price * qty
                    const isProcessing = processingSnackId === snack.id

                    return (
                      <div key={snack.id} className="p-4 border border-neutral-200 dark:border-neutral-700 rounded-lg flex flex-col justify-between hover:border-purple-300 dark:hover:border-purple-800 transition-colors bg-neutral-50 dark:bg-neutral-800/50">
                        <div className="flex justify-between items-start mb-3">
                          <div>
                            <h3 className="font-bold text-[15px]">{snack.name}</h3>
                            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">Avail: {snack.remaining}</p>
                          </div>
                          <span className="font-semibold text-green-600 dark:text-green-400 text-sm">₹{snack.price}</span>
                        </div>
                        
                        <div className="flex items-center space-x-2 mt-auto">
                          <input 
                            type="number"
                            min="1"
                            max={snack.remaining}
                            value={qty}
                            onChange={(e) => setSnackQuantities(p => ({...p, [snack.id]: parseInt(e.target.value)||1}))}
                            className="w-16 px-2 py-1.5 text-sm border border-neutral-300 dark:border-neutral-600 rounded bg-white dark:bg-neutral-900 focus:outline-none focus:ring-1 focus:ring-purple-600 text-center"
                          />
                          <button
                            onClick={() => handlePaySnack(snack)}
                            disabled={isProcessing}
                            className="flex-1 bg-purple-600 hover:bg-purple-700 text-white font-medium px-3 py-1.5 rounded transition-colors text-sm disabled:opacity-50"
                          >
                            {isProcessing ? 'Wait...' : `Pay ₹${total}`}
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </section>

            {/* 5. SNACK ORDER HISTORY */}
            <section className="bg-white dark:bg-neutral-800 p-6 rounded-xl shadow-sm border border-neutral-200 dark:border-neutral-700">
              <h2 className="text-xl font-bold mb-4 text-neutral-800 dark:text-neutral-100">Today's Purchases</h2>
              {snackOrders.length === 0 ? (
                <p className="text-sm text-neutral-500">You haven't bought any extras today.</p>
              ) : (
                <div className="space-y-4">
                  {snackOrders.map(order => (
                    <div key={order.id} className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-4 border border-neutral-200 dark:border-neutral-700 rounded-lg bg-neutral-50 dark:bg-neutral-800/50">
                      <div className="w-full sm:w-auto mb-4 sm:mb-0">
                        <div className="flex items-center space-x-2 mb-1">
                          <h4 className="font-bold text-neutral-800 dark:text-neutral-100">
                            {order.snack_stock?.snack_items?.name || 'Snack Item'}
                          </h4>
                          <span className="text-xs bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 px-2 rounded-full font-medium">x{order.quantity}</span>
                        </div>
                        <p className="text-xs text-neutral-500 dark:text-neutral-400">Total Paid: ₹{order.amount}</p>
                        <p className="text-[10px] text-neutral-400 mt-1">ID: {order.id.slice(0, 8)}...</p>
                      </div>
                      
                      <div className="flex items-center justify-between sm:justify-end w-full sm:w-auto space-x-4">
                        <div className="text-center sm:text-right">
                          <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${order.scanned ? 'bg-green-100 text-green-700 dark:bg-green-900/30' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30'}`}>
                            {order.scanned ? 'Collected' : 'Pending'}
                          </span>
                        </div>
                        {!order.scanned && order.qr_token && (
                          <div className="p-1 bg-white border border-neutral-200 rounded">
                            <QRCodeSVG value={order.qr_token} size={48} level="L" />
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

          </div>
        </div>
      </div>
    </div>
  )
}