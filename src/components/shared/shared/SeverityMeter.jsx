/**
 * SeverityMeter
 * Animated radial SVG gauge showing the current on-device threat level
 * as reported by the ONNX classifier on the Hexagon NPU.
 *
 * Props:
 *   level: 0–100 (default 0)
 *   label: string displayed below the gauge
 *   size:  number (default 120)
 *   compact: bool — tiny pill version for nav bar
 */

import { useEffect, useRef, useState } from 'react'

const ARCS = [
  { from: 0,  to: 40, color: '#10B981', label: 'NORMAL' },     // green
  { from: 40, to: 70, color: '#F59E0B', label: 'ELEVATED' },   // amber
  { from: 70, to: 90, color: '#F97316', label: 'SUSPICIOUS' }, // orange
  { from: 90, to: 100,color: '#F43F5E', label: 'THREAT' },     // red
]

function levelToColor(level) {
  for (const arc of [...ARCS].reverse()) {
    if (level >= arc.from) return arc.color
  }
  return ARCS[0].color
}

function levelToLabel(level) {
  for (const arc of [...ARCS].reverse()) {
    if (level >= arc.from) return arc.label
  }
  return 'NORMAL'
}

// Convert a 0-100 level to SVG arc path (semicircle gauge, -135° to +135°)
const R        = 44
const CX       = 60
const CY       = 60
const START_DEG = -135
const TOTAL_DEG = 270

function polar(cx, cy, r, deg) {
  const rad = (deg * Math.PI) / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

function describeArc(cx, cy, r, startDeg, endDeg) {
  const s = polar(cx, cy, r, startDeg)
  const e = polar(cx, cy, r, endDeg)
  const large = endDeg - startDeg > 180 ? 1 : 0
  return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 1 ${e.x} ${e.y}`
}

export default function SeverityMeter({ level = 0, label = '', size = 120, compact = false }) {
  const [displayed, setDisplayed] = useState(0)
  const rafRef = useRef(null)

  // Smooth animation toward target level
  useEffect(() => {
    cancelAnimationFrame(rafRef.current)
    let cur = displayed
    const target = Math.max(0, Math.min(100, level))
    const step = () => {
      const diff = target - cur
      if (Math.abs(diff) < 0.5) { setDisplayed(target); return }
      cur += diff * 0.12
      setDisplayed(cur)
      rafRef.current = requestAnimationFrame(step)
    }
    rafRef.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(rafRef.current)
  }, [level])

  const color     = levelToColor(displayed)
  const levelLabel= levelToLabel(displayed)
  const needleDeg = START_DEG + (displayed / 100) * TOTAL_DEG

  if (compact) {
    return (
      <div style={{ display:'flex', alignItems:'center', gap:5 }}>
        <div style={{
          width: 32, height: 6, borderRadius: 3,
          background: 'rgba(255,255,255,0.08)',
          overflow: 'hidden', position: 'relative',
        }}>
          <div style={{
            position:'absolute', left:0, top:0, height:'100%',
            width: `${displayed}%`,
            background: color,
            transition: 'width 0.3s ease, background 0.3s ease',
            boxShadow: `0 0 6px ${color}`,
          }}/>
        </div>
        <span style={{ fontFamily:'var(--font-mono)', fontSize:8, color, letterSpacing:'0.07em', fontWeight:700 }}>
          {levelLabel}
        </span>
      </div>
    )
  }

  const scale = size / 120

  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
      <svg width={size} height={size * 0.78} viewBox="0 0 120 94" style={{ overflow:'visible' }}>
        {/* Track arcs */}
        {ARCS.map(arc => {
          const sd = START_DEG + (arc.from / 100) * TOTAL_DEG
          const ed = START_DEG + (arc.to   / 100) * TOTAL_DEG
          return (
            <path
              key={arc.label}
              d={describeArc(CX, CY, R, sd, ed)}
              fill="none"
              stroke={arc.color}
              strokeWidth={8}
              strokeLinecap="butt"
              opacity={0.18}
            />
          )
        })}

        {/* Filled arc up to current level */}
        {displayed > 0 && (
          <path
            d={describeArc(CX, CY, R, START_DEG, START_DEG + (displayed / 100) * TOTAL_DEG)}
            fill="none"
            stroke={color}
            strokeWidth={8}
            strokeLinecap="round"
            style={{ filter:`drop-shadow(0 0 4px ${color})`, transition:'stroke 0.3s' }}
          />
        )}

        {/* Needle */}
        {(() => {
          const tip  = polar(CX, CY, R - 4, needleDeg)
          const base = polar(CX, CY, 12, needleDeg + 180)
          return (
            <line
              x1={base.x} y1={base.y} x2={tip.x} y2={tip.y}
              stroke={color} strokeWidth={2} strokeLinecap="round"
              style={{ filter:`drop-shadow(0 0 3px ${color})`, transition:'stroke 0.3s' }}
            />
          )
        })()}

        {/* Centre dot */}
        <circle cx={CX} cy={CY} r={4} fill={color} style={{ filter:`drop-shadow(0 0 5px ${color})`, transition:'fill 0.3s' }}/>

        {/* Level number */}
        <text x={CX} y={CY + 22} textAnchor="middle" fontFamily="Space Grotesk, sans-serif"
          fontSize={18} fontWeight={700} fill={color} style={{ transition:'fill 0.3s' }}>
          {Math.round(displayed)}
        </text>

        {/* Level label */}
        <text x={CX} y={CY + 36} textAnchor="middle" fontFamily="Space Grotesk, sans-serif"
          fontSize={8} fontWeight={700} fill={color} letterSpacing={1} style={{ transition:'fill 0.3s' }}>
          {levelLabel}
        </text>
      </svg>

      {label && (
        <div style={{ fontFamily:'var(--font-mono)', fontSize:8, color:'var(--text-muted)', textAlign:'center', letterSpacing:'0.06em' }}>
          {label}
        </div>
      )}
    </div>
  )
}
