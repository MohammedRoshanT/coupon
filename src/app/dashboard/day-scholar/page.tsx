'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Profile, SnackItem, SnackStock } from '@/types'
import { QRCodeSVG } from 'qrcode.react'

type SnackItemWithStock = SnackItem & { stockId: string; remaining: number }

type SnackOrderDetails = {
  id: string
  name: string
  quantity: number
  amount: number
  scanned: boolean
  qr_token: string | null
  created_at: string
}

export default function DayScholarDashboard() {
  const router = useRouter()
  const supabase = createClient()

  // State
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [profile, setProfile] = useState<Profile | null>(null)

  // Data State
  const [categorisedItems, setCategorisedItems] = useState<Record<string, SnackItemWithStock[]>>({})
  const [todayOrders, setTodayOrders] = useState<SnackOrderDetails[]>([])

  // Purchase State
  const [quantities, setQuantities] = useState<{ [key: string]: number }>({})
  const [processingId, setProcessingId] = useState<string | null>(null)

  // QR Modal State
  const [showQrModal, setShowQrModal] = useState(false)
  const [modalQrToken, setModalQrToken] = useState('')
  const [modalOrderDetails, setModalOrderDetails] = useState<{name: string, quantity: number, amount: number} | null>(null)

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

      // 1. SNACKS (Grouped by Category)
      const { data: sItems } = await supabase
        .from('snack_items')
        .select('*')
        .eq('college_id', collegeId)
        .eq('active', true)
      const activeSnacks = (sItems || []) as SnackItem[]

      const { data: sStock } = await supabase
        .from('snack_stock')
        .select('*')
        .eq('date', todayStr)
        .eq('is_closed', false)
      const snackStockList = (sStock || []) as SnackStock[]

      const mappedSnacks = activeSnacks.map(item => {
        const stock = snackStockList.find(st => st.snack_item_id === item.id)
        if (stock && stock.remaining_stock > 0) {
          return { ...item, stockId: stock.id, remaining: stock.remaining_stock }
        }
        return null
      }).filter(Boolean) as SnackItemWithStock[]

      // Group by category
      const grouped: Record<string, SnackItemWithStock[]> = {
        'meals': [],
        'drinks': [],
        'snacks': []
      }
      mappedSnacks.forEach(item => {
        const cat = item.category || 'snacks'
        if (!grouped[cat]) grouped[cat] = []
        grouped[cat].push(item)
      })
      setCategorisedItems(grouped)

      // 2. TODAY'S ORDERS (Only Snack Orders for Day Scholars now)
      const startOfDay = new Date()
      startOfDay.setHours(0, 0, 0, 0)
      const endOfDay = new Date()
      endOfDay.setHours(23, 59, 59, 999)

      const { data: snackOrdersData } = await supabase
        .from('snack_orders')
        .select('*, snack_stock(snack_items(name))')
        .eq('user_id', user.id)
        .eq('payment_status', 'paid')
        .gte('created_at', startOfDay.toISOString())
        .lte('created_at', endOfDay.toISOString())
        .order('created_at', { ascending: false })

      const sOrders = (snackOrdersData || []).map((o: any) => ({
        id: o.id,
        name: o.snack_stock?.snack_items?.name || 'Item',
        quantity: o.quantity,
        amount: o.amount,
        scanned: o.scanned,
        qr_token: o.qr_token,
        created_at: o.created_at
      }))

      setTodayOrders(sOrders)

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

  const handlePayment = async (item: SnackItemWithStock) => {
    if (!profile) return
    const quantity = quantities[item.id] || 1
    if (quantity < 1 || quantity > item.remaining) return alert('Invalid quantity')

    setProcessingId(item.id)
    let pendingRecordId: string | null = null
    const token = `DS-${profile.id}-${Date.now()}`
    const amount = item.price * quantity

    try {
      const isLoaded = await loadRazorpaySDK()
      if (!isLoaded) throw new Error('Razorpay failed to load.')

      // 1. Pre-insert pending record
      const { data: pendingData, error: insertError } = await supabase
        .from('snack_orders')
        .insert({
          user_id: profile.id,
          snack_stock_id: item.stockId,
          quantity,
          amount,
          payment_status: 'pending',
          qr_token: token,
          scanned: false,
        })
        .select('id')
        .single()

      if (insertError || !pendingData) throw new Error(insertError?.message || 'Failed to create order')
      pendingRecordId = pendingData.id

      // 2. Create Razorpay order
      const rOrderRes = await fetch('/api/payments/create-order', {
        method: 'POST',
        body: JSON.stringify({ amount, receipt: `ds_${pendingRecordId.slice(0, 25)}` }),
        headers: { 'Content-Type': 'application/json' }
      })
      const rOrder = await rOrderRes.json()
      if (rOrder.error) throw new Error(rOrder.error)

      const options = {
        key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
        amount: amount * 100,
        currency: "INR",
        name: "Canteen Checkout",
        description: `${quantity}x ${item.name}`,
        order_id: rOrder.orderId,
        handler: async function (response: any) {
          try {
            const verifyPayload = {
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
              type: 'snack_order',
              record_id: pendingRecordId,
              qr_token: token
            }

            const verifyReq = await fetch('/api/payments/verify-payment', {
              method: 'POST',
              body: JSON.stringify(verifyPayload),
              headers: { 'Content-Type': 'application/json' }
            })
            
            const verify = await verifyReq.json()
            
            if (verify.success) {
              setQuantities(prev => ({...prev, [item.id]: 1}))
              setModalQrToken(token)
              setModalOrderDetails({ name: item.name, quantity, amount })
              setShowQrModal(true)
              await loadData()
            } else {
              alert('Verification Failed: ' + verify.error)
              await supabase.from('snack_orders').delete().eq('id', pendingRecordId)
            }
          } catch (e: any) {
            alert(e.message)
          } finally {
            setProcessingId(null)
          }
        },
        modal: {
          ondismiss: async function() {
            if (pendingRecordId) {
              await supabase.from('snack_orders').delete().eq('id', pendingRecordId)
            }
            setProcessingId(null)
          }
        },
        prefill: { name: profile.full_name, email: profile.email },
        theme: { color: "#9333ea" }
      }

      const rzp = new (window as any).Razorpay(options)
      rzp.on('payment.failed', async function(res: any) {
        alert(res.error.description)
        if (pendingRecordId) {
          await supabase.from('snack_orders').delete().eq('id', pendingRecordId)
        }
        setProcessingId(null)
      })
      rzp.open()
    } catch (err: any) {
      alert(err.message)
      if (pendingRecordId) {
        await supabase.from('snack_orders').delete().eq('id', pendingRecordId)
      }
      setProcessingId(null)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-50 dark:bg-neutral-900 flex justify-center items-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-600"></div>
      </div>
    )
  }

  const categoryLabels: Record<string, string> = {
    'meals': 'Meals',
    'drinks': 'Drinks',
    'snacks': 'Snacks & Extras'
  }

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 p-6 md:p-8 pb-32">
      <div className="max-w-5xl mx-auto space-y-8">
        
        {/* Header */}
        <header className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-purple-600 to-purple-400 bg-clip-text text-transparent">
              Day Scholar Menu
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

        <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
          
          {/* LEFT COL: MENU ITEMS BY CATEGORY */}
          <div className="md:col-span-7 space-y-8">
            
            {Object.keys(categorisedItems).length === 0 || Object.values(categorisedItems).every(arr => arr.length === 0) ? (
              <div className="bg-white dark:bg-neutral-800 p-6 rounded-xl shadow-sm border border-neutral-200 dark:border-neutral-700 text-center text-neutral-500 text-sm">
                No items available currently.
              </div>
            ) : (
              Object.entries(categorisedItems).map(([categoryKey, items]) => {
                if (items.length === 0) return null

                return (
                  <section key={categoryKey} className="bg-white dark:bg-neutral-800 p-6 rounded-xl shadow-sm border border-neutral-200 dark:border-neutral-700">
                    <h2 className="text-xl font-bold mb-4 text-purple-600 dark:text-purple-400 border-b border-neutral-100 dark:border-neutral-700/50 pb-2">
                      {categoryLabels[categoryKey] || categoryKey}
                    </h2>
                    
                    <div className="space-y-4">
                      {items.map(item => {
                        const qty = quantities[item.id] || 1
                        const total = item.price * qty
                        const isProcessing = processingId === item.id

                        return (
                          <div key={item.id} className="flex flex-col sm:flex-row justify-between items-start sm:items-center py-2 border-b border-neutral-100 dark:border-neutral-700/50 last:border-0 last:pb-0">
                            <div className="mb-3 sm:mb-0">
                              <p className="font-semibold text-[15px]">{item.name}</p>
                              <div className="flex items-center space-x-3 mt-1">
                                <span className="text-sm font-bold text-green-600 dark:text-green-400">₹{item.price}</span>
                                <span className="text-xs text-neutral-500">Avail: {item.remaining}</span>
                              </div>
                            </div>
                            <div className="flex items-center space-x-2 w-full sm:w-auto">
                              <input 
                                type="number"
                                min="1"
                                max={item.remaining}
                                value={qty}
                                onChange={(e) => setQuantities(p => ({...p, [item.id]: parseInt(e.target.value)||1}))}
                                className="w-16 px-2 py-1.5 text-sm border border-neutral-300 dark:border-neutral-600 rounded bg-white dark:bg-neutral-900 focus:outline-none focus:ring-1 focus:ring-purple-600 text-center"
                              />
                              <button
                                onClick={() => handlePayment(item)}
                                disabled={isProcessing}
                                className="flex-1 sm:flex-none bg-purple-600 hover:bg-purple-700 text-white font-medium px-4 py-1.5 rounded transition-colors text-sm disabled:opacity-50"
                              >
                                {isProcessing ? 'Wait...' : `Pay ₹${total}`}
                              </button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </section>
                )
              })
            )}

          </div>

          {/* RIGHT COL: ORDERS */}
          <div className="md:col-span-5 space-y-8">
            
            {/* ORDER HISTORY */}
            <section className="bg-white dark:bg-neutral-800 p-6 rounded-xl shadow-sm border border-neutral-200 dark:border-neutral-700">
              <h2 className="text-xl font-bold mb-4 text-neutral-800 dark:text-neutral-100">Today's Purchases</h2>
              {todayOrders.length === 0 ? (
                <p className="text-sm text-neutral-500">You haven't bought anything today.</p>
              ) : (
                <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                  {todayOrders.map(order => (
                    <div key={order.id} className="flex justify-between items-center p-3 border border-neutral-200 dark:border-neutral-700 rounded-lg bg-neutral-50 dark:bg-neutral-800/50">
                      <div>
                        <div className="flex items-center space-x-2 mb-0.5">
                          <h4 className="font-bold text-sm text-neutral-800 dark:text-neutral-100">
                            {order.name}
                          </h4>
                          <span className="text-[10px] bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 px-1.5 rounded-full font-medium">x{order.quantity}</span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <p className="text-xs text-neutral-500">₹{order.amount}</p>
                        </div>
                      </div>
                      
                      <div className="flex items-center space-x-3">
                        <span className={`inline-flex px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${order.scanned ? 'bg-green-100 text-green-700 dark:bg-green-900/30' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30'}`}>
                          {order.scanned ? 'Collected' : 'Pending'}
                        </span>
                        {!order.scanned && order.qr_token && (
                          <div 
                            className="cursor-pointer group"
                            onClick={() => {
                              setModalQrToken(order.qr_token!)
                              setModalOrderDetails({ 
                                name: order.name, 
                                quantity: order.quantity, 
                                amount: order.amount 
                              })
                              setShowQrModal(true)
                            }}
                          >
                            <div className="p-0.5 bg-white border border-neutral-200 rounded group-hover:border-purple-400 transition-colors">
                              <QRCodeSVG value={order.qr_token} size={32} level="L" />
                            </div>
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

      {/* QR Code Modal */}
      {showQrModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-neutral-800 rounded-2xl p-8 max-w-sm w-full shadow-2xl relative text-center">
            <button 
              onClick={() => setShowQrModal(false)}
              className="absolute top-4 right-4 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
            </button>
            
            <h3 className="text-xl font-bold text-neutral-800 dark:text-neutral-100 mb-2">Order Confirmed</h3>
            <p className="text-sm text-neutral-500 mb-6">Show this QR at the counter</p>
            
            <div className="bg-white p-4 rounded-xl inline-block border border-neutral-200 shadow-sm mb-6">
              <QRCodeSVG value={modalQrToken} size={250} level="M" />
            </div>
            
            {modalOrderDetails && (
              <div className="bg-neutral-50 dark:bg-neutral-900 rounded-lg p-4 text-left">
                <div className="flex justify-between items-center mb-2">
                  <span className="font-semibold text-neutral-800 dark:text-neutral-100">{modalOrderDetails.name} <span className="text-purple-600">x{modalOrderDetails.quantity}</span></span>
                </div>
                <div className="flex justify-between items-center border-t border-neutral-200 dark:border-neutral-700 pt-2 mt-2">
                  <span className="text-sm text-neutral-500">Amount Paid</span>
                  <span className="font-bold text-green-600">₹{modalOrderDetails.amount}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}