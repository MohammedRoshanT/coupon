export function isValidCollegeEmail(email: string, domain: string): boolean {
  return email.endsWith(`@${domain}`)
}

export function generateQRToken(userId: string, date: string): string {
  return `${userId}-${date}-${Math.random().toString(36).substring(2, 15)}`
}

export function isWithinTimeWindow(start: string, end: string): boolean {
  const now = new Date()
  const [startHour, startMin] = start.split(':').map(Number)
  const [endHour, endMin] = end.split(':').map(Number)
  
  const startTime = new Date()
  startTime.setHours(startHour, startMin, 0)
  
  const endTime = new Date()
  endTime.setHours(endHour, endMin, 0)
  
  return now >= startTime && now <= endTime
}