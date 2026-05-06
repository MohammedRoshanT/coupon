'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Profile, MealSlot } from '@/types'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function LedgerPage() {
  const router = useRouter()
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [profile, setProfile] = useState<Profile | null>(null)

  const [hostelers, setHostelers] = useState<Profile[]>([])
  const [mealSlots, setMealSlots] = useState<MealSlot[]>([])
  const [attendances, setAttendances] = useState<any[]>([])
  
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedDate, setSelectedDate] = useState(() => new Date().toLocaleDateString('en-CA'))

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
        .eq('active', true)
        .order('start_time')
      if (slotsError) throw slotsError
      const slots = (slotsData || []) as MealSlot[]
      setMealSlots(slots)

      // Fetch Active Hostelers
      const { data: hostelersData, error: hostelersError } = await supabase
        .from('profiles')
        .select('*')
        .eq('college_id', collegeId)
        .eq('role', 'hosteler')
        .eq('active', true)
        .order('full_name')
      if (hostelersError) throw hostelersError
      setHostelers(hostelersData || [])

      // Fetch Attendance for selectedDate
      const { data: attendanceData, error: attendanceError } = await supabase
        .from('meal_attendance')
        .select('*')
        .eq('date', selectedDate)
      if (attendanceError) throw attendanceError
      setAttendances(attendanceData || [])

    } catch (err: any) {
      setError(err.message)
    } finally {
      if (showSpinner) setLoading(false)
    }
  }

  // Reload when selectedDate changes
  useEffect(() => {
    loadData(true)
  }, [selectedDate])

  // Polling every 30s
  useEffect(() => {
    const interval = setInterval(() => {
      loadData(false)
    }, 30000)
    return () => clearInterval(interval)
  }, [selectedDate])

  const exportCSV = () => {
    // CSV Header
    let csvContent = "data:text/csv;charset=utf-8,"
    csvContent += "Name,Email," + mealSlots.map(s => s.name.replace('_', ' ')).join(",") + "\n"

    const filteredHostelers = hostelers.filter(h => h.full_name?.toLowerCase().includes(searchQuery.toLowerCase()))

    filteredHostelers.forEach(h => {
      let row = `"${h.full_name || 'N/A'}","${h.email}",`
      const statuses = mealSlots.map(slot => {
        const isPresent = attendances.some(a => a.user_id === h.id && a.meal_slot_id === slot.id && a.status === 'present')
        return isPresent ? 'Present' : 'Absent'
      })
      row += statuses.join(",")
      csvContent += row + "\n"
    })

    const encodedUri = encodeURI(csvContent)
    const link = document.createElement("a")
    link.setAttribute("href", encodedUri)
    link.setAttribute("download", `hosteler_attendance_${selectedDate}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  if (loading && !profile) {
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
              Attendance Ledger
            </h1>
            <p className="text-neutral-500 dark:text-neutral-400 mt-1">Hosteler attendance records</p>
          </div>
          <Link
            href="/dashboard/canteen-admin"
            className="px-4 py-2 bg-neutral-200 dark:bg-neutral-800 hover:bg-neutral-300 dark:hover:bg-neutral-700 rounded-md transition-colors font-medium"
          >
            &larr; Back to Dashboard
          </Link>
        </header>

        {error && (
          <div className="p-4 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-md border border-red-200 dark:border-red-800">
            {error}
          </div>
        )}

        <section className="bg-white dark:bg-neutral-800 p-6 rounded-xl shadow-sm border border-neutral-200 dark:border-neutral-700">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 space-y-4 md:space-y-0 gap-4">
            <div className="flex items-center space-x-4 w-full md:w-auto">
              <div>
                <label className="block text-xs font-semibold text-neutral-500 mb-1 uppercase tracking-wider">Date</label>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-md bg-transparent focus:outline-none focus:ring-2 focus:ring-purple-600 text-sm [&::-webkit-calendar-picker-indicator]:dark:invert"
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs font-semibold text-neutral-500 mb-1 uppercase tracking-wider">Search</label>
                <input
                  type="text"
                  placeholder="Filter by name..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full min-w-[200px] px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-md bg-transparent focus:outline-none focus:ring-2 focus:ring-purple-600 text-sm"
                />
              </div>
            </div>
            <button
              onClick={exportCSV}
              className="w-full md:w-auto px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-md transition-colors text-sm font-medium whitespace-nowrap"
            >
              Export as CSV
            </button>
          </div>
          
          {mealSlots.length === 0 ? (
            <p className="text-sm text-neutral-500">No active meal slots found.</p>
          ) : (
            <div className="space-y-8">
              {mealSlots.map(slot => {
                const slotAttendances = attendances.filter(a => a.meal_slot_id === slot.id && a.status === 'present')
                const presentCount = slotAttendances.length
                
                const filteredHostelers = hostelers.filter(h => h.full_name?.toLowerCase().includes(searchQuery.toLowerCase()))

                return (
                  <div key={slot.id} className="border border-neutral-200 dark:border-neutral-700 rounded-lg overflow-hidden">
                    <div className="bg-neutral-50 dark:bg-neutral-900/50 p-4 border-b border-neutral-200 dark:border-neutral-700 flex justify-between items-center">
                      <div>
                        <h3 className="font-bold capitalize text-neutral-800 dark:text-neutral-100">{slot.name.replace('_', ' ')}</h3>
                        <p className="text-xs text-neutral-500">{slot.start_time.slice(0, 5)} - {slot.end_time.slice(0, 5)}</p>
                      </div>
                      <div className="text-sm font-semibold bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 px-3 py-1 rounded-full">
                        {presentCount} / {hostelers.length} Present
                      </div>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-sm">
                        <thead>
                          <tr className="bg-white dark:bg-neutral-800 border-b border-neutral-200 dark:border-neutral-700 text-neutral-500 dark:text-neutral-400">
                            <th className="p-3 font-medium">Name</th>
                            <th className="p-3 font-medium">Email</th>
                            <th className="p-3 font-medium text-right">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-100 dark:divide-neutral-700/50 bg-white dark:bg-neutral-800">
                          {filteredHostelers.map(hosteler => {
                            const isPresent = slotAttendances.some(a => a.user_id === hosteler.id)
                            return (
                              <tr key={hosteler.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-900/30 transition-colors">
                                <td className="p-3 font-medium text-neutral-800 dark:text-neutral-200">{hosteler.full_name || 'N/A'}</td>
                                <td className="p-3 text-neutral-500">{hosteler.email}</td>
                                <td className="p-3 text-right">
                                  {isPresent ? (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                                      Present
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
                                      Absent
                                    </span>
                                  )}
                                </td>
                              </tr>
                            )
                          })}
                          {filteredHostelers.length === 0 && (
                            <tr>
                              <td colSpan={3} className="p-4 text-center text-neutral-500">
                                No hostelers found.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>

      </div>
    </div>
  )
}
