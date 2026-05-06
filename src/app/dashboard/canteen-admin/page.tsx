'use client'

import { useEffect, useState, useRef } from 'react'
import { Html5QrcodeScanner, Html5QrcodeScannerState } from 'html5-qrcode'
import { createClient } from '@/lib/supabase/client'
import { MealSlot, SnackItem, SnackStock, Profile } from '@/types'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function CanteenAdminDashboard() {
  const router = useRouter()
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [profile, setProfile] = useState<Profile | null>(null)

  // DB States
  const [mealSlots, setMealSlots] = useState<MealSlot[]>([])

  const [snackItems, setSnackItems] = useState<SnackItem[]>([])
  const [todaySnackStocks, setTodaySnackStocks] = useState<SnackStock[]>([])

  // Overview
  const [overview, setOverview] = useState({ booked: 0, snackOrders: 0, revenue: 0 })
  const [refreshingStats, setRefreshingStats] = useState(false)

  // Current Date
  const todayStr = new Date().toLocaleDateString('en-CA')

  // Scanner States
  const [showScanner, setShowScanner] = useState(false)
  const [scanResult, setScanResult] = useState<{
    success: boolean
    type?: string
    student_name?: string
    slot_name?: string
    item_name?: string
    quantity?: number
    message?: string
  } | null>(null)
  const scannerRef = useRef<Html5QrcodeScanner | null>(null)
  const isScanningRef = useRef(false)
  const isProcessingRef = useRef(false)

  // Forms
  const [slotName, setSlotName] = useState<MealSlot['name']>('breakfast')
  const [slotStart, setSlotStart] = useState('')
  const [slotEnd, setSlotEnd] = useState('')
  const [creatingSlot, setCreatingSlot] = useState(false)
  
  const [editingSlotId, setEditingSlotId] = useState<string | null>(null)
  const [editSlotStart, setEditSlotStart] = useState('')
  const [editSlotEnd, setEditSlotEnd] = useState('')
  const [savingSlotTime, setSavingSlotTime] = useState(false)

  const [sItemName, setSItemName] = useState('')
  const [sItemPrice, setSItemPrice] = useState('')
  const [sItemCategory, setSItemCategory] = useState<'meals' | 'drinks' | 'snacks'>('snacks')
  const [creatingSItem, setCreatingSItem] = useState(false)

  const [sStockInputs, setSStockInputs] = useState<{ [key: string]: string }>({})
  const [settingSStock, setSettingSStock] = useState<{ [key: string]: boolean }>({})

  const loadData = async (showSpinner = true) => {
    if (showSpinner) setLoading(true)
    setError('')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const { data: userProfile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()

      if (profileError || !userProfile) throw new Error('Profile not found')
      const collegeId = userProfile.college_id
      if (!collegeId) {
        throw new Error('Your profile is not assigned to any college. Please contact a super admin.')
      }
      setProfile(userProfile as Profile)

      // Fetch Meal Slots
      const { data: slotsData, error: slotsError } = await supabase
        .from('meal_slots')
        .select('*')
        .eq('college_id', collegeId)
        .order('start_time')
      if (slotsError) throw slotsError
      const slots = (slotsData || []) as MealSlot[]
      setMealSlots(slots)

      // Fetch Snack Items
      const { data: snacksData, error: snacksError } = await supabase
        .from('snack_items')
        .select('*')
        .eq('college_id', collegeId)
        .order('created_at')
      if (snacksError) throw snacksError
      const sItems = (snacksData || []) as SnackItem[]
      setSnackItems(sItems)

      // Fetch Today's Snack Stocks
      const sItemIds = sItems.map(s => s.id)
      let sStocks: SnackStock[] = []
      if (sItemIds.length > 0) {
        const { data: sStocksData } = await supabase
          .from('snack_stock')
          .select('*')
          .eq('date', todayStr)
          .in('snack_item_id', sItemIds)
        sStocks = (sStocksData || []) as SnackStock[]
      }
      setTodaySnackStocks(sStocks)

      // FETCH OVERVIEW STATS
      await fetchStats(collegeId)

    } catch (err: any) {
      setError(err.message)
    } finally {
      if (showSpinner) setLoading(false)
    }
  }

  const fetchStats = async (cid?: string) => {
    const targetCollegeId = cid || profile?.college_id
    if (!targetCollegeId) return
    setRefreshingStats(true)

    const now = new Date()
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).toISOString()
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).toISOString()

    try {
      // 1. Orders (Meals)
      // Hosteler base meals
      const { data: hostelerOrders } = await supabase
        .from('orders')
        .select('amount, profiles!orders_user_id_fkey!inner(college_id)')
        .eq('payment_status', 'paid')
        .gte('created_at', startOfDay)
        .lte('created_at', endOfDay)
        .eq('profiles.college_id', targetCollegeId)

      let bookedMeals = hostelerOrders ? hostelerOrders.length : 0
      let totalRev = hostelerOrders ? hostelerOrders.reduce((acc, curr) => acc + (curr.amount || 0), 0) : 0

      // 3. All Snack Orders (includes Day Scholar meals)
      const { data: allSnackOrders, error: sErr } = await supabase
        .from('snack_orders')
        .select('amount, snack_stock!inner(snack_items!inner(category, college_id))')
        .eq('payment_status', 'paid')
        .gte('created_at', startOfDay)
        .lte('created_at', endOfDay)
        .eq('snack_stock.snack_items.college_id', targetCollegeId)

      let snackOrdersCount = 0

      if (allSnackOrders) {
        allSnackOrders.forEach((so: any) => {
          totalRev += (so.amount || 0)
          const cat = so.snack_stock?.snack_items?.category
          if (cat === 'meals') {
            bookedMeals += 1
          } else {
            snackOrdersCount += 1 // 'drinks' or 'snacks' or missing
          }
        })
      } else if (sErr) {
        console.error('Snack orders fetch error:', sErr)
      }

      setOverview({
        booked: bookedMeals,
        snackOrders: snackOrdersCount,
        revenue: totalRev
      })
    } catch (err) {
      console.error('Failed to refresh stats:', err)
    } finally {
      setRefreshingStats(false)
    }
  }

  useEffect(() => {
    loadData(true)
    const interval = setInterval(() => {
      loadData(false)
    }, 30000)
    return () => clearInterval(interval)
  }, [])

  // --- Scanner Logic ---
  useEffect(() => {
    if (showScanner) {
      scannerRef.current = new Html5QrcodeScanner(
        'qr-scanner',
        { fps: 10, qrbox: { width: 250, height: 250 } },
        false
      )

      scannerRef.current.render(
        async (decodedText) => {
          if (isProcessingRef.current) return
          isProcessingRef.current = true

          if (scannerRef.current && scannerRef.current.getState() === Html5QrcodeScannerState.SCANNING) {
            try {
              scannerRef.current.pause(true)
            } catch (err) {
              console.warn('Could not pause scanner:', err)
            }
            isScanningRef.current = false
          }
          await handleVerifyQR(decodedText)
        },
        (error) => {
          // ignore background scan errors
        }
      )
      isScanningRef.current = true
    } else {
      if (scannerRef.current) {
        try {
          scannerRef.current.clear().catch(console.error)
        } catch (err) {
          console.warn('Could not clear scanner:', err)
        }
        scannerRef.current = null
        isScanningRef.current = false
      }
    }

    return () => {
      if (scannerRef.current) {
        try {
          scannerRef.current.clear().catch(console.error)
        } catch (err) {
          console.warn('Could not clear scanner on cleanup:', err)
        }
        isScanningRef.current = false
      }
    }
  }, [showScanner])

  const handleVerifyQR = async (token: string) => {
    try {
      const res = await fetch('/api/qr/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ qr_token: token })
      })
      const data = await res.json()
      
      setScanResult(data)
      
      if (data.success) {
        setShowScanner(false)
        // Delay to allow database commit
        setTimeout(() => fetchStats(profile?.college_id), 500)
      } else {
        // if failed, resume scanner so they can try again
        if (scannerRef.current) {
          try {
            scannerRef.current.resume()
          } catch (err) {
            console.warn('Could not resume scanner:', err)
          }
          isScanningRef.current = true
        }
      }

      // clear result after 5 seconds
      setTimeout(() => {
        setScanResult(null)
      }, 5000)

    } catch (err: any) {
      setScanResult({ success: false, message: 'Network error or invalid response.' })
      setTimeout(() => setScanResult(null), 5000)
      if (scannerRef.current) {
        try {
          scannerRef.current.resume()
        } catch (err) {
          console.warn('Could not resume scanner on error:', err)
        }
        isScanningRef.current = true
      }
    } finally {
      isProcessingRef.current = false
    }
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/auth/login')
  }

  // --- Meal Slots Handlers ---
  const handleCreateMealSlot = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!profile) return
    setCreatingSlot(true)
    setError('')
    try {
      const { error: insertError } = await supabase.from('meal_slots').insert({
        college_id: profile.college_id,
        name: slotName,
        start_time: slotStart,
        end_time: slotEnd,
        active: true
      })
      if (insertError) throw insertError
      setSlotStart('')
      setSlotEnd('')
      await loadData()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setCreatingSlot(false)
    }
  }

  const toggleSlotActive = async (id: string, active: boolean) => {
    setError('')
    try {
      const { error } = await supabase.from('meal_slots').update({ active: !active }).eq('id', id)
      if (error) throw error
      await loadData()
    } catch (err: any) {
      setError(err.message)
    }
  }

  const handleEditSlotTime = async (slotId: string) => {
    setSavingSlotTime(true)
    setError('')
    try {
      const { error } = await supabase.from('meal_slots').update({
        start_time: editSlotStart,
        end_time: editSlotEnd
      }).eq('id', slotId)
      if (error) throw error
      setEditingSlotId(null)
      await loadData()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSavingSlotTime(false)
    }
  }

  // --- Snack Items Handlers ---
  const handleCreateSnackItem = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!profile) return
    setCreatingSItem(true)
    setError('')
    try {
      const { error: insertError } = await supabase.from('snack_items').insert({
        college_id: profile.college_id,
        name: sItemName,
        category: sItemCategory,
        price: parseFloat(sItemPrice) || 0,
        active: true
      })
      if (insertError) throw insertError
      setSItemName('')
      setSItemPrice('')
      setSItemCategory('snacks')
      await loadData()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setCreatingSItem(false)
    }
  }

  const toggleSItemActive = async (id: string, active: boolean) => {
    setError('')
    try {
      const { error } = await supabase.from('snack_items').update({ active: !active }).eq('id', id)
      if (error) throw error
      await loadData()
    } catch (err: any) {
      setError(err.message)
    }
  }

  // --- Snack Stock Handlers ---
  const handleSetSStock = async (sItemId: string) => {
    const total = parseInt(sStockInputs[sItemId] || '0')
    if (total <= 0) return
    setSettingSStock(prev => ({ ...prev, [sItemId]: true }))
    setError('')
    try {
      const { error } = await supabase.from('snack_stock').insert({
        snack_item_id: sItemId,
        date: todayStr,
        total_stock: total,
        remaining_stock: total,
        is_closed: false
      })
      if (error) throw error
      setSStockInputs(prev => ({ ...prev, [sItemId]: '' }))
      await loadData()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSettingSStock(prev => ({ ...prev, [sItemId]: false }))
    }
  }

  const handleCloseSStock = async (stockId: string, sItemId: string) => {
    setSettingSStock(prev => ({ ...prev, [sItemId]: true }))
    setError('')
    try {
      const { error } = await supabase.from('snack_stock').update({ is_closed: true }).eq('id', stockId)
      if (error) throw error
      await loadData()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSettingSStock(prev => ({ ...prev, [sItemId]: false }))
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-50 dark:bg-neutral-900 flex justify-center items-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-600"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 p-8 pb-32">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* HEADER */}
        <header className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-600 to-purple-400 bg-clip-text text-transparent">
              Canteen Admin
            </h1>
            <p className="text-neutral-500 dark:text-neutral-400 mt-1">Manage meals, snacks, and daily operations</p>
          </div>
          <div className="flex items-center space-x-4">
            <Link
              href="/dashboard/canteen-admin/ledger"
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-md transition-colors font-medium text-sm"
            >
              View Ledger
            </Link>
            <button
              onClick={handleLogout}
              className="px-4 py-2 bg-neutral-200 dark:bg-neutral-800 hover:bg-neutral-300 dark:hover:bg-neutral-700 rounded-md transition-colors font-medium"
            >
              Logout
            </button>
          </div>
        </header>

        {error && (
          <div className="p-4 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-md border border-red-200 dark:border-red-800">
            {error}
          </div>
        )}

        {/* 1. OVERVIEW */}
        <section className="relative z-10">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-neutral-800 dark:text-neutral-100">Overview</h2>
            <button
              onClick={() => fetchStats(profile?.college_id)}
              disabled={refreshingStats}
              className="flex items-center space-x-2 px-3 py-1.5 bg-neutral-200 hover:bg-neutral-300 dark:bg-neutral-800 dark:hover:bg-neutral-700 rounded-md transition-colors text-sm text-neutral-700 dark:text-neutral-300 disabled:opacity-50"
            >
              <svg className={`w-4 h-4 ${refreshingStats ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
              <span>{refreshingStats ? 'Refreshing...' : 'Refresh'}</span>
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white dark:bg-neutral-800 p-6 rounded-xl shadow-sm border border-neutral-200 dark:border-neutral-700 flex flex-col items-center justify-center">
              <h3 className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-widest text-center">Meals Booked</h3>
              <p className="text-4xl font-bold text-purple-600 dark:text-purple-400 mt-2">{overview.booked}</p>
            </div>
            <div className="bg-white dark:bg-neutral-800 p-6 rounded-xl shadow-sm border border-neutral-200 dark:border-neutral-700 flex flex-col items-center justify-center">
              <h3 className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-widest text-center">Snack Orders</h3>
              <p className="text-4xl font-bold text-purple-600 dark:text-purple-400 mt-2">{overview.snackOrders}</p>
            </div>
            <div className="bg-white dark:bg-neutral-800 p-6 rounded-xl shadow-sm border border-neutral-200 dark:border-neutral-700 flex flex-col items-center justify-center">
              <h3 className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-widest text-center">Total Revenue</h3>
              <p className="text-4xl font-bold text-green-600 dark:text-green-400 mt-2">₹{overview.revenue}</p>
            </div>
          </div>
        </section>

        {/* SCANNER SECTION */}
        <section className="bg-white dark:bg-neutral-800 p-6 rounded-xl shadow-sm border border-neutral-200 dark:border-neutral-700">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-neutral-800 dark:text-neutral-100">Scan QR Code</h2>
            <button
              onClick={() => setShowScanner(!showScanner)}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-md transition-colors text-sm font-medium"
            >
              {showScanner ? 'Close Scanner' : 'Open Scanner'}
            </button>
          </div>

          {showScanner && (
            <div className="w-full max-w-sm mx-auto overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900">
              <div id="qr-scanner" className="w-full"></div>
            </div>
          )}

          {scanResult && (
            <div className={`mt-4 p-4 rounded-lg border ${scanResult.success ? 'bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800/50' : 'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800/50'}`}>
              {scanResult.success ? (
                <div className="flex items-start">
                  <div className="text-green-500 mr-3 mt-0.5">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                  </div>
                  <div>
                    <h3 className="font-bold text-green-800 dark:text-green-400 text-lg">Scan Successful</h3>
                    <div className="mt-2 space-y-1 text-green-700 dark:text-green-300">
                      <p><span className="font-semibold text-green-800 dark:text-green-400">Student:</span> {scanResult.student_name}</p>
                      <p><span className="font-semibold text-green-800 dark:text-green-400">Type:</span> {scanResult.type === 'hosteler_meal' ? 'Hosteler Meal' : scanResult.type === 'snack_order' ? 'Snack Order' : 'Day Scholar Meal'}</p>
                      <p><span className="font-semibold text-green-800 dark:text-green-400">Item/Slot:</span> {scanResult.slot_name || scanResult.item_name}</p>
                      {scanResult.quantity && <p><span className="font-semibold text-green-800 dark:text-green-400">Quantity:</span> {scanResult.quantity}</p>}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center">
                  <div className="text-red-500 mr-3">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                  </div>
                  <div>
                    <h3 className="font-bold text-red-800 dark:text-red-400">Scan Failed</h3>
                    <p className="text-red-700 dark:text-red-300 mt-1">{scanResult.message}</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

        {/* HOSTELER SCHEDULE SECTION */}
        <div className="pt-8 border-t border-neutral-200 dark:border-neutral-700">
          <h2 className="text-2xl font-bold text-neutral-800 dark:text-neutral-100 mb-1">Hosteler Meal Schedule</h2>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-6 border-l-4 border-amber-400 pl-3 py-1 bg-amber-50 dark:bg-amber-900/10 inline-block rounded-r-md">
            Set time windows for each meal. Hostelers scan their QR during these windows.
          </p>
          <div className="max-w-2xl">
            
            {/* Meal Slots configuration */}
            <div className="space-y-6">
              <section className="bg-white dark:bg-neutral-800 p-6 rounded-xl shadow-sm border border-neutral-200 dark:border-neutral-700">
                <h3 className="text-lg font-semibold mb-4 text-purple-600 dark:text-purple-400">Add Meal Slot</h3>
                <form onSubmit={handleCreateMealSlot} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-1 text-neutral-700 dark:text-neutral-300">Slot</label>
                    <select
                      required
                      value={slotName}
                      onChange={(e) => setSlotName(e.target.value as any)}
                      className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-md bg-transparent focus:outline-none focus:ring-2 focus:ring-purple-600 [&>option]:text-black"
                    >
                      <option value="breakfast">Breakfast</option>
                      <option value="lunch">Lunch</option>
                      <option value="tea_snacks">Tea Snacks</option>
                      <option value="dinner">Dinner</option>
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-1 text-neutral-700 dark:text-neutral-300">Start Time</label>
                      <input
                        type="time"
                        required
                        value={slotStart}
                        onChange={(e) => setSlotStart(e.target.value)}
                        className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-md bg-transparent focus:outline-none focus:ring-2 focus:ring-purple-600"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1 text-neutral-700 dark:text-neutral-300">End Time</label>
                      <input
                        type="time"
                        required
                        value={slotEnd}
                        onChange={(e) => setSlotEnd(e.target.value)}
                        className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-md bg-transparent focus:outline-none focus:ring-2 focus:ring-purple-600"
                      />
                    </div>
                  </div>
                  <button
                    type="submit"
                    disabled={creatingSlot}
                    className="w-full bg-purple-600 hover:bg-purple-700 text-white py-2 rounded-md transition-colors disabled:opacity-50 font-medium"
                  >
                    {creatingSlot ? 'Adding...' : 'Add Slot'}
                  </button>
                </form>
              </section>

              {/* Displaying meal slots + their items */}
              <section className="bg-white dark:bg-neutral-800 p-6 rounded-xl shadow-sm border border-neutral-200 dark:border-neutral-700">
                <h3 className="text-lg font-semibold mb-4 text-purple-600 dark:text-purple-400">Meal Slots & Menu</h3>
                {mealSlots.length === 0 ? (
                  <p className="text-neutral-500">No meal slots configured yet.</p>
                ) : (
                  <div className="space-y-6">
                    {mealSlots.map(slot => (
                      <div key={slot.id} className="border border-neutral-200 dark:border-neutral-700 rounded-lg p-4 bg-neutral-50 dark:bg-neutral-900/50">
                        <div className="flex justify-between items-center border-b border-neutral-200 dark:border-neutral-700 pb-2 mb-3">
                          <div>
                            <p className="font-bold capitalize text-lg tracking-tight">{slot.name.replace('_', ' ')}</p>
                            {editingSlotId === slot.id ? (
                              <div className="flex items-center space-x-2 mt-1">
                                <input type="time" value={editSlotStart} onChange={(e) => setEditSlotStart(e.target.value)} className="text-xs px-1 py-0.5 border border-neutral-300 dark:border-neutral-600 rounded bg-transparent focus:outline-none focus:ring-1 focus:ring-purple-600" />
                                <span className="text-xs">-</span>
                                <input type="time" value={editSlotEnd} onChange={(e) => setEditSlotEnd(e.target.value)} className="text-xs px-1 py-0.5 border border-neutral-300 dark:border-neutral-600 rounded bg-transparent focus:outline-none focus:ring-1 focus:ring-purple-600" />
                                <button onClick={() => handleEditSlotTime(slot.id)} disabled={savingSlotTime} className="text-[10px] bg-purple-600 hover:bg-purple-700 transition-colors text-white px-2 py-0.5 rounded font-medium disabled:opacity-50">Save</button>
                                <button onClick={() => setEditingSlotId(null)} className="text-[10px] bg-neutral-200 hover:bg-neutral-300 dark:bg-neutral-700 dark:hover:bg-neutral-600 transition-colors px-2 py-0.5 rounded font-medium text-neutral-700 dark:text-neutral-300">Cancel</button>
                              </div>
                            ) : (
                              <p className="text-xs text-neutral-500">{slot.start_time.slice(0, 5)} - {slot.end_time.slice(0, 5)}</p>
                            )}
                          </div>
                          <div className="flex items-center space-x-3">
                            <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${slot.active ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-neutral-200 text-neutral-700 dark:bg-neutral-700 dark:text-neutral-400'}`}>
                              {slot.active ? 'Active' : 'Offline'}
                            </span>
                            <button
                              onClick={() => {
                                setEditingSlotId(slot.id)
                                setEditSlotStart(slot.start_time)
                                setEditSlotEnd(slot.end_time)
                              }}
                              className="text-xs hover:underline text-blue-500"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => toggleSlotActive(slot.id, slot.active)}
                              className={`text-xs hover:underline ${slot.active ? 'text-red-500' : 'text-green-500'}`}
                            >
                              Toggle
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          </div>
        </div>

        {/* 5 & 6. SNACKS SECTION */}
        <div className="pt-8 border-t border-neutral-200 dark:border-neutral-700">
          <h2 className="text-2xl font-bold text-neutral-800 dark:text-neutral-100 mb-6">Snacks Management</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            
            {/* Snack Items */}
            <div className="space-y-6">
              <section className="bg-white dark:bg-neutral-800 p-6 rounded-xl shadow-sm border border-neutral-200 dark:border-neutral-700">
                <h3 className="text-lg font-semibold mb-4 text-purple-600 dark:text-purple-400">Add Snack Item</h3>
                <form onSubmit={handleCreateSnackItem} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-1 text-neutral-700 dark:text-neutral-300">Snack Name</label>
                    <input
                      type="text"
                      required
                      value={sItemName}
                      onChange={(e) => setSItemName(e.target.value)}
                      placeholder="e.g. Samosa"
                      className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-md bg-transparent focus:outline-none focus:ring-2 focus:ring-purple-600"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1 text-neutral-700 dark:text-neutral-300">Category</label>
                    <select
                      required
                      value={sItemCategory}
                      onChange={(e) => setSItemCategory(e.target.value as any)}
                      className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-md bg-transparent focus:outline-none focus:ring-2 focus:ring-purple-600 [&>option]:text-black"
                    >
                      <option value="meals">Meals</option>
                      <option value="drinks">Drinks</option>
                      <option value="snacks">Snacks</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1 text-neutral-700 dark:text-neutral-300">Price (₹)</label>
                    <input
                      type="number"
                      required
                      value={sItemPrice}
                      onChange={(e) => setSItemPrice(e.target.value)}
                      min="0"
                      step="0.01"
                      className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-md bg-transparent focus:outline-none focus:ring-2 focus:ring-purple-600"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={creatingSItem}
                    className="w-full bg-purple-600 hover:bg-purple-700 text-white py-2 rounded-md transition-colors disabled:opacity-50 font-medium"
                  >
                    {creatingSItem ? 'Adding...' : 'Add Snack'}
                  </button>
                </form>
              </section>

              <section className="bg-white dark:bg-neutral-800 p-6 rounded-xl shadow-sm border border-neutral-200 dark:border-neutral-700">
                <h3 className="text-lg font-semibold mb-4 text-purple-600 dark:text-purple-400">Snack Items Directory</h3>
                {snackItems.length === 0 ? (
                  <p className="text-sm text-neutral-500">No snacks configured in database.</p>
                ) : (
                  <ul className="space-y-3">
                    {snackItems.map(snack => (
                      <li key={snack.id} className="flex justify-between items-center p-3 border border-neutral-100 dark:border-neutral-700/50 rounded-lg bg-neutral-50 dark:bg-neutral-900/50">
                        <div className="flex flex-col">
                          <div className="flex items-center space-x-2">
                            <span className={`font-semibold text-[15px] ${snack.active ? 'text-neutral-900 dark:text-white' : 'text-neutral-400 line-through'}`}>{snack.name}</span>
                            {snack.category && (
                              <span className="text-[10px] bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 px-2 py-0.5 rounded capitalize">
                                {snack.category}
                              </span>
                            )}
                          </div>
                          <span className="text-xs text-green-600 dark:text-green-400 font-medium mt-1">₹{snack.price}</span>
                        </div>
                        <div className="flex items-center space-x-3">
                          <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${snack.active ? 'bg-green-100 text-green-700 dark:bg-green-900/30' : 'bg-neutral-200 text-neutral-500 dark:bg-neutral-700'}`}>
                            {snack.active ? 'Active' : 'Offline'}
                          </span>
                          <button
                            onClick={() => toggleSItemActive(snack.id, snack.active)}
                            className={`text-xs hover:underline ${snack.active ? 'text-red-500' : 'text-green-500'}`}
                          >
                            Toggle
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>

            {/* Daily Snack Stock Col */}
            <div className="space-y-6">
              <section className="bg-white dark:bg-neutral-800 p-6 rounded-xl shadow-sm border border-neutral-200 dark:border-neutral-700">
                <h3 className="text-lg font-semibold mb-4 text-purple-600 dark:text-purple-400">Daily Snack Stock</h3>
                {snackItems.filter(s => s.active).length === 0 ? (
                  <p className="text-sm text-neutral-500">No active snacks to manage for today.</p>
                ) : (
                  <div className="space-y-4">
                    {snackItems.filter(s => s.active).map(snack => {
                      const stockLog = todaySnackStocks.find(st => st.snack_item_id === snack.id)
                      const isSetting = settingSStock[snack.id]

                      return (
                        <div key={snack.id} className="p-4 border border-neutral-200 dark:border-neutral-700 rounded-lg">
                          <div className="flex justify-between items-center mb-3">
                            <h4 className="font-semibold text-neutral-800 dark:text-neutral-200">{snack.name}</h4>
                            <span className="text-xs text-green-600 dark:text-green-400 font-medium tracking-wide">₹{snack.price}</span>
                          </div>

                          {!stockLog ? (
                            <div className="flex items-center space-x-2">
                              <input
                                type="number"
                                placeholder="Qty"
                                className="w-full px-3 py-1.5 text-sm border border-neutral-300 dark:border-neutral-600 rounded-md bg-transparent focus:outline-none focus:ring-2 focus:ring-purple-600"
                                value={sStockInputs[snack.id] || ''}
                                onChange={(e) => setSStockInputs(prev => ({ ...prev, [snack.id]: e.target.value }))}
                                min="1"
                              />
                              <button
                                onClick={() => handleSetSStock(snack.id)}
                                disabled={isSetting || !sStockInputs[snack.id]}
                                className="whitespace-nowrap bg-purple-600 hover:bg-purple-700 text-white px-4 py-1.5 text-sm rounded-md font-medium disabled:opacity-50 transition-colors"
                              >
                                {isSetting ? '...' : 'Set'}
                              </button>
                            </div>
                          ) : (
                            <div className="flex justify-between items-center bg-neutral-50 dark:bg-neutral-800/50 p-2 rounded border border-neutral-100 dark:border-neutral-700/50">
                              <div className="text-sm">
                                <p className="text-neutral-500 dark:text-neutral-400">Total: <span className="font-medium text-neutral-900 dark:text-neutral-100">{stockLog.total_stock}</span></p>
                                <p className="text-neutral-500 dark:text-neutral-400">Rem: <span className="font-bold text-neutral-900 dark:text-neutral-100">{stockLog.remaining_stock}</span></p>
                              </div>
                              <div className="text-right">
                                {stockLog.is_closed ? (
                                  <span className="text-xs font-bold text-red-500 px-2 py-1 rounded-full bg-red-50 dark:bg-red-900/10">CLOSED</span>
                                ) : (
                                  <button
                                    onClick={() => handleCloseSStock(stockLog.id, snack.id)}
                                    disabled={isSetting}
                                    className="text-xs bg-red-100 hover:bg-red-200 dark:bg-red-900/30 dark:hover:bg-red-900/50 text-red-700 dark:text-red-400 font-medium px-3 py-1.5 rounded transition-colors disabled:opacity-50"
                                  >
                                    Close Manually
                                  </button>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </section>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}