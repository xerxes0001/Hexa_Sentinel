// Feature #75 — Real-time uptime counter
import { useState, useEffect, useRef } from 'react'
import { formatUptime } from '../utils/timeUtils.js'

export function useUptime() {
  const startRef = useRef(Date.now())
  const [uptime, setUptime] = useState('00h 00m 00s')
  useEffect(() => {
    const t = setInterval(() => setUptime(formatUptime(startRef.current)), 1000)
    return () => clearInterval(t)
  }, [])
  return uptime
}
