/**
 * Phase 2 — Global BGP Threat Map
 * Features 9-17: SVG world map with animated attack arcs
 * Pure SVG, no external libraries
 */
import { useState, useRef } from 'react'
import { useSHYENStore } from '../../store/useSHYENStore.js'
import earthMapUrl from '../../assets/earth-map.png'
import { INDIA_BOUNDARY, INDIA_FILL_COLOR, INDIA_ISLAND_TERRITORIES } from '../../data/indiaBoundary.js'
import { INDIAN_ASNS } from '../../data/indianASNs.js'
import { SEVERITY_COLORS as SEV_COLOR, SEVERITY_ORDER } from '../../utils/severity.js'

const MAP_W = 800
const MAP_H = 380

const COUNTRY_INFO = {
  IN: { lon: 78,   lat: 20,  label: 'India',       isTarget: true  },
  CN: { lon: 104,  lat: 35,  label: 'China',        isTarget: false },
  PK: { lon: 68,   lat: 30,  label: 'Pakistan',     isTarget: false },
  US: { lon: -95,  lat: 38,  label: 'USA',          isTarget: false },
  DE: { lon: 10,   lat: 51,  label: 'Germany',      isTarget: false },
  IT: { lon: 12,   lat: 42,  label: 'Italy',        isTarget: false },
  AU: { lon: 134,  lat: -25, label: 'Australia',    isTarget: false },
  JP: { lon: 138,  lat: 36,  label: 'Japan',        isTarget: false },
  EG: { lon: 30,   lat: 26,  label: 'Egypt',        isTarget: false },
  RU: { lon: 37,   lat: 55,  label: 'Russia',       isTarget: false },
  GB: { lon: -2,   lat: 54,  label: 'UK',           isTarget: false },
  NL: { lon: 5,    lat: 52,  label: 'Netherlands',  isTarget: false },
  FR: { lon: 2,    lat: 46,  label: 'France',       isTarget: false },
  BR: { lon: -51,  lat: -10, label: 'Brazil',       isTarget: false },
  SG: { lon: 104,  lat: 1,   label: 'Singapore',    isTarget: false },
  KR: { lon: 128,  lat: 36,  label: 'South Korea',  isTarget: false },
  CA: { lon: -106, lat: 56,  label: 'Canada',       isTarget: false },
  ZA: { lon: 24,   lat: -29, label: 'South Africa', isTarget: false },
  ID: { lon: 113,  lat: -2,  label: 'Indonesia',    isTarget: false },
  VN: { lon: 108,  lat: 16,  label: 'Vietnam',      isTarget: false },
  TH: { lon: 101,  lat: 15,  label: 'Thailand',     isTarget: false },
  UA: { lon: 31,   lat: 49,  label: 'Ukraine',      isTarget: false },
  PL: { lon: 19,   lat: 52,  label: 'Poland',       isTarget: false },
  ES: { lon: -4,   lat: 40,  label: 'Spain',        isTarget: false },
  SE: { lon: 18,   lat: 60,  label: 'Sweden',       isTarget: false },
  CH: { lon: 8,    lat: 47,  label: 'Switzerland',  isTarget: false },
  TR: { lon: 35,   lat: 39,  label: 'Turkey',       isTarget: false },
  HK: { lon: 114,  lat: 22,  label: 'Hong Kong',    isTarget: false },
  TW: { lon: 121,  lat: 24,  label: 'Taiwan',       isTarget: false },
  MX: { lon: -102, lat: 23,  label: 'Mexico',       isTarget: false },
  AE: { lon: 54,   lat: 24,  label: 'UAE',          isTarget: false },
  SA: { lon: 45,   lat: 24,  label: 'Saudi Arabia', isTarget: false },
  IR: { lon: 53,   lat: 32,  label: 'Iran',         isTarget: false },
  BD: { lon: 90,   lat: 24,  label: 'Bangladesh',   isTarget: false },
  NG: { lon: 8,    lat: 9,   label: 'Nigeria',      isTarget: false },
  RO: { lon: 25,   lat: 46,  label: 'Romania',      isTarget: false },
}

// Fallback position for unmapped country codes — places them in a neutral zone
const FALLBACK_POS = { lon: 0, lat: 0 }

function lonLatToXY(lon, lat) {
  return {
    x: ((lon + 180) / 360) * MAP_W,
    y: ((90 - lat)  / 180) * MAP_H,
  }
}

const POSITIONS = {}
for (const [code, info] of Object.entries(COUNTRY_INFO)) {
  POSITIONS[code] = lonLatToXY(info.lon, info.lat)
}

const INDIA = POSITIONS['IN']

const VANTAGE_POS = [
  { name: 'Amsterdam', lon: 4.9,   lat: 52.4  },
  { name: 'Singapore', lon: 103.8, lat: 1.3   },
  { name: 'New York',  lon: -74,   lat: 40.7  },
  { name: 'Tokyo',     lon: 139.7, lat: 35.7  },
  { name: 'Sydney',    lon: 151.2, lat: -33.9 },
  { name: 'Sao Paulo', lon: -46.6, lat: -23.5 },
  { name: 'Oregon',    lon: -120,  lat: 44.1  },
  { name: 'Geneva',    lon: 6.1,   lat: 46.2  },
].map(v => ({ ...v, ...lonLatToXY(v.lon, v.lat) }))

export default function ThreatMap({ onCountryClick, selectedCountry }) {
  const [zoom,   setZoom]   = useState(1)
  const [pan,    setPan]    = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const dragStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 })

  const MIN_ZOOM = 1
  const MAX_ZOOM = 4

  function zoomIn()  { setZoom(z => Math.min(MAX_ZOOM, +(z + 0.5).toFixed(2))) }
  function zoomOut() { setZoom(z => {
    const nz = Math.max(MIN_ZOOM, +(z - 0.5).toFixed(2))
    if (nz === MIN_ZOOM) setPan({ x: 0, y: 0 })
    return nz
  }) }
  function resetZoom() { setZoom(1); setPan({ x: 0, y: 0 }) }

  function onPointerDown(e) {
    if (zoom === 1) return
    setDragging(true)
    dragStart.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y }
  }
  function onPointerMove(e) {
    if (!dragging) return
    const dx = (e.clientX - dragStart.current.x) / zoom
    const dy = (e.clientY - dragStart.current.y) / zoom
    setPan({ x: dragStart.current.panX + dx, y: dragStart.current.panY + dy })
  }
  function onPointerUp() { setDragging(false) }

  // Compute viewBox based on zoom/pan
  const vbW = MAP_W / zoom
  const vbH = MAP_H / zoom
  const vbX = (MAP_W - vbW) / 2 - pan.x
  const vbY = (MAP_H - vbH) / 2 - pan.y
  const viewBox = `${vbX} ${vbY} ${vbW} ${vbH}`

  const incidents = useSHYENStore(s => s.incidents)

  // Build attack map — one entry per country, worst severity wins
  const sevOrder = SEVERITY_ORDER
  const attackMap = new Map()
  const unresolved = []
  for (const inc of incidents) {
    if (inc.status === 'MITIGATED') continue
    const c = inc.attacker?.country
    if (!c || c === '??' || !POSITIONS[c]) { unresolved.push(inc); continue }
    const ex = attackMap.get(c)
    if (!ex || sevOrder.indexOf(inc.severity) < sevOrder.indexOf(ex.severity)) {
      attackMap.set(c, inc)
    }
  }
  const attacks      = Array.from(attackMap.entries())
  const unknownCount = unresolved.length
  const avgConf      = attacks.length > 0 ? Math.round(attacks.reduce((s,[,a]) => s + a.confidence, 0) / attacks.length) : 0

  // Plot unresolved-origin incidents at a shared "pending lookup" position
  // (offshore, near the equator/prime-meridian) — real incident, country pending RIPE STAT resolution
  const PENDING_POS = lonLatToXY(-20, 5)

  return (
    <div style={{ background: 'rgba(6,10,15,0.9)', border: '1px solid var(--border-subtle)', borderRadius: 6, overflow: 'hidden' }}>

      {/* Header — title/subtitle already rendered by the parent wrapper in
          App.jsx (which also owns the 3D/2D toggle); this component only
          adds the severity legend, which isn't duplicated anywhere else. */}
      <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
        <div style={{ display: 'flex', gap: 10 }}>
          {Object.entries(SEV_COLOR).map(([s, c]) => (
            <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: c }} />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--text-muted)' }}>{s}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Map */}
      <div style={{ position: 'relative' }}>
        <svg
          viewBox={viewBox}
          style={{ width: '100%', display: 'block', background: '#06090f', cursor: zoom > 1 ? (dragging ? 'grabbing' : 'grab') : 'default' }}
          onMouseDown={onPointerDown}
          onMouseMove={onPointerMove}
          onMouseUp={onPointerUp}
          onMouseLeave={onPointerUp}
        >
        {/* Grid */}
        {[0,60,120,180,240,300,360].map(lon => (
          <line key={lon} x1={(lon/360)*MAP_W} y1={0} x2={(lon/360)*MAP_W} y2={MAP_H} stroke="#0c1824" strokeWidth="0.5" />
        ))}
        {[0,45,90,135,180].map(lat => (
          <line key={lat} x1={0} y1={(lat/180)*MAP_H} x2={MAP_W} y2={(lat/180)*MAP_H} stroke="#0c1824" strokeWidth="0.5" />
        ))}

        {/* Real-world country boundaries (re-projected equirectangular,
            recolored to the SHYEN dark/green theme — same asset as Globe3D) */}
        <image
          href={earthMapUrl}
          x={0} y={0} width={MAP_W} height={MAP_H}
          preserveAspectRatio="none"
          opacity="0.95"
        />

        {/* India — corrected boundary overlay. The base texture above follows
            the LAC (Line of Actual Control) in the north, cutting off
            Gilgit-Baltistan and Aksai Chin. This polygon paints the correct
            Survey-of-India boundary on top — see src/data/indiaBoundary.js
            for provenance. Uses the same equirectangular projection as the
            base image, so it aligns exactly. */}
        <polygon
          points={INDIA_BOUNDARY.map(([lon, lat]) => {
            const p = lonLatToXY(lon, lat)
            return `${p.x},${p.y}`
          }).join(' ')}
          fill={INDIA_FILL_COLOR}
          fillOpacity="0.55"
          stroke="#5ba86b"
          strokeWidth="0.6"
          strokeOpacity="0.8"
        />

        {/* India's island territories — not visible in the base texture at
            this resolution (confirmed via pixel sampling: both locations
            render as plain ocean color), so marked explicitly here. */}
        {INDIA_ISLAND_TERRITORIES.map(({ name, lon, lat }) => {
          const p = lonLatToXY(lon, lat)
          return (
            <g key={name}>
              <circle cx={p.x} cy={p.y} r={2.8} fill={INDIA_FILL_COLOR} stroke="#5ba86b" strokeWidth="0.6" />
              <text x={p.x + 4} y={p.y + 2.5} fontSize="6.5" fill="#5ba86b" fontFamily="var(--font-mono)" fontWeight="600">{name}</text>
            </g>
          )
        })}

        {/* Vantage point dots */}
        {VANTAGE_POS.map(v => (
          <g key={v.name}>
            <circle cx={v.x} cy={v.y} r={2.5} fill="#00bfff" opacity="0.4" />
            <circle cx={v.x} cy={v.y} r={5}   fill="none" stroke="#00bfff" strokeWidth="0.4" opacity="0.15" />
          </g>
        ))}

        {/* Attack arcs — resolved origins */}
        {attacks.map(([country, inc]) => {
          const from  = POSITIONS[country]
          if (!from) return null
          const color = SEV_COLOR[inc.severity] ?? '#888'
          const mx    = (from.x + INDIA.x) / 2
          const my    = (from.y + INDIA.y) / 2 - 55
          const d     = `M ${from.x} ${from.y} Q ${mx} ${my} ${INDIA.x} ${INDIA.y}`
          const dur   = (2.5 + Math.random()).toFixed(1)
          return (
            <g key={country}>
              <path d={d} fill="none" stroke={color} strokeWidth="0.8" opacity="0.18" />
              <path d={d} fill="none" stroke={color} strokeWidth="1.5" opacity="0.08" strokeDasharray="4 4" />
              <circle r="3.5" fill={color} style={{ filter: `drop-shadow(0 0 4px ${color})`, opacity: 0.9 }}>
                <animateMotion dur={`${dur}s`} repeatCount="indefinite" path={d} />
              </circle>
            </g>
          )
        })}

        {/* Attack arcs — unresolved origins (real incident, country lookup pending/failed) */}
        {unresolved.length > 0 && (() => {
          const inc   = unresolved[0]
          const color = SEV_COLOR[inc.severity] ?? '#888'
          const from  = PENDING_POS
          const mx    = (from.x + INDIA.x) / 2
          const my    = (from.y + INDIA.y) / 2 - 55
          const d     = `M ${from.x} ${from.y} Q ${mx} ${my} ${INDIA.x} ${INDIA.y}`
          return (
            <g key="pending">
              <path d={d} fill="none" stroke={color} strokeWidth="0.8" opacity="0.12" strokeDasharray="2 4" />
              <circle r="3" fill={color} style={{ filter: `drop-shadow(0 0 4px ${color})`, opacity: 0.7 }}>
                <animateMotion dur="3.2s" repeatCount="indefinite" path={d} />
              </circle>
            </g>
          )
        })()}

        {/* Attacker nodes */}
        {attacks.map(([country, inc]) => {
          const pos   = POSITIONS[country]
          if (!pos) return null
          const color = SEV_COLOR[inc.severity] ?? '#888'
          const info  = COUNTRY_INFO[country]
          const isSel = selectedCountry === country
          return (
            <g key={country} style={{ cursor: 'pointer' }} onClick={() => onCountryClick?.(isSel ? null : country)}>
              {isSel && <circle cx={pos.x} cy={pos.y} r={12} fill="none" stroke={color} strokeWidth="1.2" opacity="0.5" />}
              <circle cx={pos.x} cy={pos.y} r={5} fill={color} style={{ filter: `drop-shadow(0 0 5px ${color})` }} />
              <text x={pos.x + 9} y={pos.y - 7} fontFamily="'JetBrains Mono',monospace" fontSize="8" fill={color}>{info?.label}</text>
              <text x={pos.x + 9} y={pos.y + 3} fontFamily="'JetBrains Mono',monospace" fontSize="7" fill="#444">{inc.attacker.asn}</text>
            </g>
          )
        })}

        {/* Pending-origin node — real incident, country lookup in progress */}
        {unresolved.length > 0 && (
          <g style={{ cursor: 'default' }}>
            <circle cx={PENDING_POS.x} cy={PENDING_POS.y} r={9} fill="none" stroke="#ffd60a" strokeWidth="0.6" opacity="0.3">
              <animate attributeName="r" from="5" to="13" dur="1.6s" repeatCount="indefinite" />
              <animate attributeName="opacity" from="0.4" to="0" dur="1.6s" repeatCount="indefinite" />
            </circle>
            <circle cx={PENDING_POS.x} cy={PENDING_POS.y} r={4.5} fill="#ffd60a" opacity="0.85" style={{ filter: 'drop-shadow(0 0 4px #ffd60a)' }} />
            <text x={PENDING_POS.x} y={PENDING_POS.y + 2.5} textAnchor="middle" fontFamily="'JetBrains Mono',monospace" fontSize="7" fontWeight="bold" fill="#06090f">?</text>
            <text x={PENDING_POS.x + 9} y={PENDING_POS.y - 6} fontFamily="'JetBrains Mono',monospace" fontSize="8" fill="#ffd60a">Resolving origin…</text>
            <text x={PENDING_POS.x + 9} y={PENDING_POS.y + 4} fontFamily="'JetBrains Mono',monospace" fontSize="7" fill="#666">{unresolved.length} incident{unresolved.length > 1 ? 's' : ''}</text>
          </g>
        )}

        {/* India — small destination-anchor marker for attack arcs, NOT a
            country-shape indicator (the actual shape is the corrected
            boundary polygon drawn earlier). This used to be drawn at a
            radius that visually swallowed the whole country outline —
            shrunk significantly so the real (corrected) shape stays
            visible underneath it. */}
        <circle cx={INDIA.x} cy={INDIA.y} r={10} fill="none" stroke="#00ff88" strokeWidth="0.3" opacity="0.2">
          <animate attributeName="r" from="6" to="12" dur="2.5s" repeatCount="indefinite" />
          <animate attributeName="opacity" from="0.3" to="0" dur="2.5s" repeatCount="indefinite" />
        </circle>
        <circle cx={INDIA.x} cy={INDIA.y} r={2.5} fill="#00ff88" style={{ filter: 'drop-shadow(0 0 4px #00ff88)' }} />
        <text x={INDIA.x + 9} y={INDIA.y - 6}  fontFamily="'JetBrains Mono',monospace" fontSize="9" fontWeight="bold" fill="#00ff88">India</text>
        <text x={INDIA.x + 9} y={INDIA.y + 5}  fontFamily="'JetBrains Mono',monospace" fontSize="7" fill="#446644">{INDIAN_ASNS.length} ASNs</text>
      </svg>

        {/* Zoom controls */}
        <div style={{
          position: 'absolute', top: 8, right: 8,
          display: 'flex', flexDirection: 'column', gap: 2,
        }}>
          {[
            { label: '+', fn: zoomIn,  disabled: zoom >= MAX_ZOOM },
            { label: '−', fn: zoomOut, disabled: zoom <= MIN_ZOOM },
            { label: '⤾', fn: resetZoom, disabled: zoom === MIN_ZOOM && pan.x === 0 && pan.y === 0 },
          ].map((btn, i) => (
            <button
              key={i}
              onClick={btn.fn}
              disabled={btn.disabled}
              style={{
                width: 22, height: 22,
                background: 'rgba(10,18,28,0.9)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 3,
                color: btn.disabled ? '#333' : 'var(--text-secondary)',
                fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700,
                cursor: btn.disabled ? 'default' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                lineHeight: 1, padding: 0,
              }}
            >{btn.label}</button>
          ))}
        </div>

        {/* Zoom level indicator */}
        {zoom > 1 && (
          <div style={{
            position: 'absolute', bottom: 8, right: 8,
            fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--text-muted)',
            background: 'rgba(10,18,28,0.9)', border: '1px solid var(--border-subtle)',
            borderRadius: 3, padding: '2px 6px',
          }}>{zoom.toFixed(1)}x · drag to pan</div>
        )}
      </div>

      {/* Stats strip */}
      <div style={{ display: 'flex', borderTop: '1px solid var(--border-subtle)' }}>
        {[
          ['Vantage Points', '8'],
          ['Attack Origins', attacks.length],
          ['Active Attacks', attacks.length + unknownCount],
          ['Avg Confidence', attacks.length ? `${avgConf}%` : '—'],
        ].map(([label, value]) => (
          <div key={label} style={{ flex: 1, padding: '8px 0', textAlign: 'center', borderRight: '1px solid var(--border-subtle)' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 800, color: 'var(--text-primary)' }}>{value}</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--text-muted)', letterSpacing: 1 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Filter badge */}
      {unknownCount > 0 && !selectedCountry && (
        <div style={{ padding:'5px 16px', borderTop:'1px solid var(--border-subtle)', display:'flex', alignItems:'center', gap:6 }}>
          <div style={{ width:5, height:5, borderRadius:'50%', background:'#ffd60a', animation:'termBlink 1.2s ease infinite' }} />
          <span style={{ fontFamily:'var(--font-mono)', fontSize:8, color:'var(--text-muted)' }}>
            Resolving origin for {unknownCount} incident{unknownCount > 1 ? 's' : ''} via RIPE STAT...
          </span>
        </div>
      )}

      {selectedCountry && (
        <div style={{ padding: '6px 16px', borderTop: '1px solid var(--border-subtle)', background: 'rgba(255,45,85,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--accent-red)' }}>
            Filtering: {COUNTRY_INFO[selectedCountry]?.label ?? selectedCountry}
          </span>
          <button onClick={() => onCountryClick?.(null)} style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--text-muted)', background: 'none', border: '1px solid var(--border-subtle)', borderRadius: 2, padding: '2px 8px', cursor: 'pointer' }}>
            CLEAR
          </button>
        </div>
      )}
    </div>
  )
}
