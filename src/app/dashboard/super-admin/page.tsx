'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { College, Profile } from '@/types'
import { useRouter } from 'next/navigation'

type CanteenAdmin = Profile & { colleges: { name: string } | null }

export default function SuperAdminDashboard() {
  const router = useRouter()
  const supabase = createClient()

  const [colleges, setColleges] = useState<College[]>([])
  const [canteenAdmins, setCanteenAdmins] = useState<CanteenAdmin[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // College form state
  const [newCollegeName, setNewCollegeName] = useState('')
  const [newCollegeDomain, setNewCollegeDomain] = useState('')
  const [creatingCollege, setCreatingCollege] = useState(false)

  // Canteen admin form state
  const [newAdminName, setNewAdminName] = useState('')
  const [newAdminEmail, setNewAdminEmail] = useState('')
  const [newAdminPassword, setNewAdminPassword] = useState('')
  const [newAdminCollegeId, setNewAdminCollegeId] = useState('')
  const [creatingAdmin, setCreatingAdmin] = useState(false)

  const fetchColleges = async () => {
    try {
      const { data: collegesData, error: collegesError } = await supabase
        .from('colleges')
        .select('*')
        .order('created_at', { ascending: false })
      
      if (collegesError) throw collegesError
      setColleges(collegesData || [])
    } catch (err: any) {
      setError(err.message)
    }
  }

  const fetchCanteenAdmins = async () => {
    try {
      const { data: adminsData, error: adminsError } = await supabase
        .from('profiles')
        .select('*, colleges(name)')
        .eq('role', 'canteen_admin')
        .order('created_at', { ascending: false })
      
      if (adminsError) throw adminsError
      setCanteenAdmins(adminsData as unknown as CanteenAdmin[] || [])
    } catch (err: any) {
      setError(err.message)
    }
  }

  const loadAllData = async () => {
    setLoading(true)
    setError('')
    await Promise.all([fetchColleges(), fetchCanteenAdmins()])
    setLoading(false)
  }

  useEffect(() => {
    loadAllData()
  }, [])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/auth/login')
  }

  const handleCreateCollege = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreatingCollege(true)
    setError('')
    try {
      const { error: insertError } = await supabase
        .from('colleges')
        .insert({
          name: newCollegeName,
          email_domain: newCollegeDomain,
          active: true
        })

      if (insertError) throw insertError

      setNewCollegeName('')
      setNewCollegeDomain('')
      await fetchColleges()
    } catch (err: any) {
      setError(err.message || 'Failed to create college')
    } finally {
      setCreatingCollege(false)
    }
  }

  const handleCreateCanteenAdmin = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreatingAdmin(true)
    setError('')
    try {
      const response = await fetch('/api/admin/create-canteen-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: newAdminName,
          email: newAdminEmail,
          password: newAdminPassword,
          college_id: newAdminCollegeId
        })
      })

      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || 'Failed to create canteen admin')
      }

      setNewAdminName('')
      setNewAdminEmail('')
      setNewAdminPassword('')
      setNewAdminCollegeId('')
      await fetchCanteenAdmins()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setCreatingAdmin(false)
    }
  }

  const toggleCollegeActive = async (id: string, currentStatus: boolean) => {
    setError('')
    try {
      const { error: updateError } = await supabase
        .from('colleges')
        .update({ active: !currentStatus })
        .eq('id', id)

      if (updateError) throw updateError
      
      setColleges(colleges.map(c => c.id === id ? { ...c, active: !currentStatus } : c))
    } catch (err: any) {
      setError(err.message)
    }
  }

  const toggleAdminActive = async (id: string, currentStatus: boolean) => {
    setError('')
    try {
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ active: !currentStatus })
        .eq('id', id)

      if (updateError) throw updateError
      
      setCanteenAdmins(canteenAdmins.map(a => a.id === id ? { ...a, active: !currentStatus } : a))
    } catch (err: any) {
      setError(err.message)
    }
  }

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <header className="flex items-center justify-between">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-600 to-purple-400 bg-clip-text text-transparent">
            Super Admin Dashboard
          </h1>
          <button
            onClick={handleLogout}
            className="px-4 py-2 bg-neutral-200 dark:bg-neutral-800 hover:bg-neutral-300 dark:hover:bg-neutral-700 rounded-md transition-colors font-medium"
          >
            Logout
          </button>
        </header>

        {error && (
          <div className="p-4 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-md border border-red-200 dark:border-red-800">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-purple-600"></div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            
            {/* Colleges Column */}
            <div className="space-y-8">
              {/* Add College Form */}
              <section className="bg-white dark:bg-neutral-800 p-6 rounded-xl shadow-sm border border-neutral-200 dark:border-neutral-700">
                <h2 className="text-xl font-semibold mb-4 text-purple-600 dark:text-purple-400">Add New College</h2>
                <form onSubmit={handleCreateCollege} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">College Name</label>
                    <input
                      type="text"
                      required
                      value={newCollegeName}
                      onChange={(e) => setNewCollegeName(e.target.value)}
                      className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-md bg-transparent focus:outline-none focus:ring-2 focus:ring-purple-600 transition-shadow"
                      placeholder="e.g. Engineering College"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Email Domain</label>
                    <input
                      type="text"
                      required
                      value={newCollegeDomain}
                      onChange={(e) => setNewCollegeDomain(e.target.value)}
                      className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-md bg-transparent focus:outline-none focus:ring-2 focus:ring-purple-600 transition-shadow"
                      placeholder="e.g. engcollege.edu"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={creatingCollege}
                    className="w-full px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-md font-medium transition-colors"
                  >
                    {creatingCollege ? 'Adding...' : 'Add College'}
                  </button>
                </form>
              </section>

              {/* Colleges Table */}
              <section className="bg-white dark:bg-neutral-800 rounded-xl shadow-sm border border-neutral-200 dark:border-neutral-700 overflow-hidden">
                <div className="p-6 border-b border-neutral-200 dark:border-neutral-700">
                  <h2 className="text-xl font-semibold text-purple-600 dark:text-purple-400">Colleges List</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-neutral-50 dark:bg-neutral-800 border-b border-neutral-200 dark:border-neutral-700">
                      <tr>
                        <th className="px-6 py-3 font-medium">Name</th>
                        <th className="px-6 py-3 font-medium">Domain</th>
                        <th className="px-6 py-3 font-medium">Status</th>
                        <th className="px-6 py-3 font-medium">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-200 dark:divide-neutral-700">
                      {colleges.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="px-6 py-4 text-center text-neutral-500">No colleges found.</td>
                        </tr>
                      ) : (
                        colleges.map((college) => (
                          <tr key={college.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-700/50 transition-colors">
                            <td className="px-6 py-4">{college.name}</td>
                            <td className="px-6 py-4 text-neutral-600 dark:text-neutral-400">{college.email_domain}</td>
                            <td className="px-6 py-4">
                              <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${college.active ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-neutral-100 text-neutral-700 dark:bg-neutral-700 dark:text-neutral-300'}`}>
                                {college.active ? 'Active' : 'Inactive'}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              <button
                                onClick={() => toggleCollegeActive(college.id, college.active)}
                                className={`text-sm hover:underline ${college.active ? 'text-red-500' : 'text-green-500'}`}
                              >
                                {college.active ? 'Deactivate' : 'Activate'}
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>

            {/* Canteen Admins Column */}
            <div className="space-y-8">
              {/* Add Canteen Admin Form */}
              <section className="bg-white dark:bg-neutral-800 p-6 rounded-xl shadow-sm border border-neutral-200 dark:border-neutral-700">
                <h2 className="text-xl font-semibold mb-4 text-purple-600 dark:text-purple-400">Create Canteen Admin</h2>
                <form onSubmit={handleCreateCanteenAdmin} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Full Name</label>
                    <input
                      type="text"
                      required
                      value={newAdminName}
                      onChange={(e) => setNewAdminName(e.target.value)}
                      className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-md bg-transparent focus:outline-none focus:ring-2 focus:ring-purple-600 transition-shadow"
                      placeholder="e.g. John Doe"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Email</label>
                    <input
                      type="email"
                      required
                      value={newAdminEmail}
                      onChange={(e) => setNewAdminEmail(e.target.value)}
                      className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-md bg-transparent focus:outline-none focus:ring-2 focus:ring-purple-600 transition-shadow"
                      placeholder="e.g. john@engcollege.edu"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Password</label>
                    <input
                      type="password"
                      required
                      value={newAdminPassword}
                      onChange={(e) => setNewAdminPassword(e.target.value)}
                      className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-md bg-transparent focus:outline-none focus:ring-2 focus:ring-purple-600 transition-shadow"
                      placeholder="Strong password"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Assign College</label>
                    <select
                      required
                      value={newAdminCollegeId}
                      onChange={(e) => setNewAdminCollegeId(e.target.value)}
                      className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-md bg-transparent focus:outline-none focus:ring-2 focus:ring-purple-600 transition-shadow [&>option]:text-black"
                    >
                      <option value="">Select a college</option>
                      {colleges.filter(c => c.active).map(college => (
                        <option key={college.id} value={college.id}>{college.name}</option>
                      ))}
                    </select>
                  </div>
                  <button
                    type="submit"
                    disabled={creatingAdmin}
                    className="w-full px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-md font-medium transition-colors"
                  >
                    {creatingAdmin ? 'Creating...' : 'Create Admin'}
                  </button>
                </form>
              </section>

              {/* Canteen Admins Table */}
              <section className="bg-white dark:bg-neutral-800 rounded-xl shadow-sm border border-neutral-200 dark:border-neutral-700 overflow-hidden">
                <div className="p-6 border-b border-neutral-200 dark:border-neutral-700">
                  <h2 className="text-xl font-semibold text-purple-600 dark:text-purple-400">Canteen Admins List</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-neutral-50 dark:bg-neutral-800 border-b border-neutral-200 dark:border-neutral-700">
                      <tr>
                        <th className="px-6 py-3 font-medium">Name</th>
                        <th className="px-6 py-3 font-medium">Email</th>
                        <th className="px-6 py-3 font-medium">College</th>
                        <th className="px-6 py-3 font-medium">Status</th>
                        <th className="px-6 py-3 font-medium">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-200 dark:divide-neutral-700">
                      {canteenAdmins.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-6 py-4 text-center text-neutral-500">No admins found.</td>
                        </tr>
                      ) : (
                        canteenAdmins.map((admin) => (
                          <tr key={admin.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-700/50 transition-colors">
                            <td className="px-6 py-4 font-medium">{admin.full_name}</td>
                            <td className="px-6 py-4 text-neutral-600 dark:text-neutral-400">{admin.email}</td>
                            <td className="px-6 py-4">{admin.colleges?.name || 'N/A'}</td>
                            <td className="px-6 py-4">
                              <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${admin.active ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-neutral-100 text-neutral-700 dark:bg-neutral-700 dark:text-neutral-300'}`}>
                                {admin.active ? 'Active' : 'Inactive'}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              <button
                                onClick={() => toggleAdminActive(admin.id, admin.active)}
                                className={`text-sm hover:underline ${admin.active ? 'text-red-500' : 'text-green-500'}`}
                              >
                                {admin.active ? 'Deactivate' : 'Activate'}
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>

          </div>
        )}
      </div>
    </div>
  )
}