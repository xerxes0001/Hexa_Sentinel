/**
 * Change History Panel — Interruption Handling
 *
 * Inspector for the structured change log built by src/engine/changeHistory.js.
 * Unlike the Activity Log ticker (text, capped, in-memory only), every row
 * here is a discrete state transition with an explicit before/after diff,
 * and the whole list is persisted to localStorage — it survives a refresh,
 * a crash, or a deliberate pause. That persistence is demonstrated inline:
 * the panel shows how long ago the *browser session* started versus how far
 * back the recorded history goes, so it's visible when the two diverge
 * (i.e. when history was recovered from before an interruption).
 */
import { useState, useMemo } from 'react'
import { useSHYENStore } from '../../store/useSHYENStore.js'

const TYPE_COLOR = {
  DETECTED:    '#ff9f0a',
  ACTION:      'var(--accent-blue)',
  STATUS:      '#30d158',
  AI_DECISION: '#bf5af2',
  SESSION:     '#ffd60a',
  CHECKPOINT:  '#00e5ff',
}
const TYPE_LABEL = {
  DETECTED:    'INCIDENT DETECTED',
  ACTION:      'ACTION',
  STATUS:      'STATUS CHANGE',
  AI_DECISION: 'AI DECISION',
  SESSION:     'SESSION',
  CHECKPOINT:  'CHECKPOINT',
}
const TYPES = ['All', 'DETECTED', 'ACTION', 'STATUS', 'AI_DECISION', 'SESSION', 'CHECKPOINT']

// The moment this panel's module first evaluates == roughly when the
// current browser session started. Recorded entries with a timestamp
// before this is proof they were loaded from persisted storage, not
// generated in the running session — i.e. genuine recovery, not a replay.
const SESSION_STARTED_AT = new Date()

function fmtTime(iso) {
  const d = new Date(iso)
  return d.toISOString().replace('T', ' ').slice(0, 19) + ' UTC'
}
function fmtVal(v) {
  if (v === null || v === undefined) return '—'
  if (v === true) return 'true'
  if (v === false) return 'false'
  return String(v)
}

function DiffRow({ d }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:8, fontFamily:'var(--font-mono)', fontSize:9, padding:'3px 0' }}>
      <span style={{ color:'var(--text-muted)', minWidth:100 }}>{d.key}</span>
      <span style={{ color:'#ff6b6b' }}>{fmtVal(d.before)}</span>
      <span style={{ color:'var(--text-muted)' }}>→</span>
      <span style={{ color:'#30d158' }}>{fmtVal(d.after)}</span>
    </div>
  )
}

function EntryRow({ entry, onFilterIncident }) {
  const [open, setOpen] = useState(false)
  const recoveredFromPriorSession = new Date(entry.timestamp) < SESSION_STARTED_AT
  const color = TYPE_COLOR[entry.type] ?? '#888'

  return (
    <div style={{ border:'1px solid var(--border-subtle)', borderRadius:4, marginBottom:6, overflow:'hidden' }}>
      <div
        onClick={() => entry.diff.length && setOpen(v => !v)}
        style={{
          display:'flex', alignItems:'center', gap:10, padding:'8px 12px',
          background:'rgba(255,255,255,0.02)', cursor: entry.diff.length ? 'pointer' : 'default',
        }}
      >
        <span style={{
          fontFamily:'var(--font-mono)', fontSize:8, color, border:`1px solid ${color}44`,
          borderRadius:2, padding:'1px 5px', flexShrink:0, letterSpacing:0.5,
        }}>{TYPE_LABEL[entry.type] ?? entry.type}</span>

        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontFamily:'var(--font-display)', fontSize:11, fontWeight:700, color:'var(--text-primary)' }}>{entry.label}</div>
          <div style={{ fontFamily:'var(--font-mono)', fontSize:8.5, color:'var(--text-secondary)' }}>
            #{String(entry.id).padStart(4,'0')} · {fmtTime(entry.timestamp)}
            {entry.incidentId != null && (
              <>
                {' · '}
                {onFilterIncident ? (
                  <span
                    onClick={e => { e.stopPropagation(); onFilterIncident() }}
                    title="Filter to this incident"
                    style={{ color:'var(--accent-green)', cursor:'pointer', textDecoration:'underline dotted' }}
                  >incident {entry.incidentId}</span>
                ) : (
                  <>incident {entry.incidentId}</>
                )}
              </>
            )}
          </div>
        </div>

        {recoveredFromPriorSession && (
          <span title="Loaded from persisted storage — recorded before this browser session started" style={{
            fontFamily:'var(--font-mono)', fontSize:7.5, color:'#ffd60a', border:'1px solid #ffd60a44',
            borderRadius:2, padding:'1px 5px', flexShrink:0, letterSpacing:0.5,
          }}>RECOVERED</span>
        )}

        {entry.diff.length > 0 && (
          <span style={{ fontFamily:'var(--font-mono)', fontSize:8, color:'var(--text-muted)', flexShrink:0 }}>
            {entry.diff.length} field{entry.diff.length > 1 ? 's' : ''} {open ? '▲' : '▼'}
          </span>
        )}
      </div>

      {open && entry.diff.length > 0 && (
        <div style={{ padding:'6px 12px 10px', background:'rgba(6,10,16,0.6)' }}>
          {entry.diff.map(d => <DiffRow key={d.key} d={d} />)}
        </div>
      )}
    </div>
  )
}

export default function ChangeHistoryPanel({ onClose }) {
  const changeHistory        = useSHYENStore(s => s.changeHistory)
  const clearChangeHistoryLog = useSHYENStore(s => s.clearChangeHistoryLog)
  const recordCheckpoint     = useSHYENStore(s => s.recordCheckpoint)
  const [typeFilter, setTypeFilter] = useState('All')
  const [incidentFilter, setIncidentFilter] = useState('All')

  // Distinct incident IDs actually present in the log, newest-touched first —
  // built from the log itself so the dropdown never lists an incident with
  // zero entries, and needs no prop/plumbing from wherever this panel is
  // opened from (it's opened context-free from the top nav).
  const incidentOptions = useMemo(() => {
    const seen = new Map() // incidentId -> most recent timestamp touching it
    for (const e of changeHistory) {
      if (e.incidentId == null) continue
      const prev = seen.get(e.incidentId)
      if (!prev || new Date(e.timestamp) > new Date(prev)) seen.set(e.incidentId, e.timestamp)
    }
    return [...seen.entries()]
      .sort((a, b) => new Date(b[1]) - new Date(a[1]))
      .map(([id]) => id)
  }, [changeHistory])

  const filtered = useMemo(() => {
    let list = typeFilter === 'All' ? changeHistory : changeHistory.filter(e => e.type === typeFilter)
    if (incidentFilter !== 'All') list = list.filter(e => e.incidentId === incidentFilter)
    return [...list].reverse() // most recent first
  }, [changeHistory, typeFilter, incidentFilter])

  const oldestRecorded = changeHistory[0]
  const recoveredCount = changeHistory.filter(e => new Date(e.timestamp) < SESSION_STARTED_AT).length

  return (
    <div style={{
      position:'fixed', inset:0, zIndex:200,
      background:'rgba(4,7,14,0.97)', overflowY:'auto',
      animation:'fadeIn 0.2s ease-out',
    }}>
      {/* Header */}
      <div style={{ position:'sticky', top:0, background:'rgba(4,7,14,0.98)', borderBottom:'1px solid var(--border-subtle)', padding:'12px 24px', display:'flex', alignItems:'center', justifyContent:'space-between', zIndex:10 }}>
        <div>
          <div style={{ fontFamily:'var(--font-display)', fontSize:18, fontWeight:800 }}>CHANGE HISTORY</div>
          <div style={{ fontFamily:'var(--font-mono)', fontSize:9, color:'var(--text-muted)', marginTop:2 }}>
            {changeHistory.length} recorded transition{changeHistory.length === 1 ? '' : 's'}
            {oldestRecorded && <> · earliest {fmtTime(oldestRecorded.timestamp)}</>}
            {recoveredCount > 0 && <> · <span style={{ color:'#ffd60a' }}>{recoveredCount} recovered from a prior session</span></>}
          </div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <button onClick={() => recordCheckpoint('manual')} style={{
            fontFamily:'var(--font-mono)', fontSize:9, color:'#00e5ff',
            background:'rgba(0,229,255,0.08)', border:'1px solid rgba(0,229,255,0.4)',
            borderRadius:4, padding:'6px 14px', cursor:'pointer',
          }}>📍 CHECKPOINT NOW</button>
          <button onClick={clearChangeHistoryLog} style={{
            fontFamily:'var(--font-mono)', fontSize:9, color:'var(--text-muted)',
            background:'rgba(255,255,255,0.04)', border:'1px solid var(--border-subtle)',
            borderRadius:4, padding:'6px 14px', cursor:'pointer',
          }}>CLEAR LOG</button>
          <button onClick={onClose} style={{
            fontFamily:'var(--font-mono)', fontSize:9, color:'#ff2d55',
            background:'rgba(255,45,85,0.08)', border:'1px solid rgba(255,45,85,0.45)',
            borderRadius:4, padding:'6px 14px', cursor:'pointer', boxShadow:'0 0 8px rgba(255,45,85,0.3)',
          }}>✕ CLOSE</button>
        </div>
      </div>

      {/* Explainer strip — makes the recovery guarantee explicit rather than implied */}
      <div style={{ padding:'10px 24px', borderBottom:'1px solid var(--border-subtle)', background:'rgba(255,214,10,0.03)' }}>
        <div style={{ fontFamily:'var(--font-mono)', fontSize:9, color:'var(--text-secondary)', lineHeight:1.6 }}>
          Every action, status change, and AI decision below is written to persistent storage the moment it happens —
          independent of the live session. Refresh or close the tab and reopen it: entries timestamped before this
          session started are marked <span style={{ color:'#ffd60a' }}>RECOVERED</span>, proving the record survives an interruption rather than resetting with the page.
        </div>
      </div>

      {/* Filters */}
      <div style={{ display:'flex', alignItems:'center', gap:6, padding:'12px 24px', borderBottom:'1px solid var(--border-subtle)', flexWrap:'wrap' }}>
        {TYPES.map(t => (
          <button key={t} onClick={() => setTypeFilter(t)} style={{
            fontFamily:'var(--font-mono)', fontSize:9, letterSpacing:'0.05em',
            padding:'6px 12px', borderRadius:4, cursor:'pointer',
            background: typeFilter === t ? 'rgba(0,255,136,0.12)' : 'none',
            border:`1px solid ${typeFilter === t ? 'var(--accent-green)' : 'var(--border-subtle)'}`,
            color: typeFilter === t ? 'var(--accent-green)' : 'var(--text-muted)',
          }}>{t === 'All' ? 'ALL' : (TYPE_LABEL[t] ?? t)}</button>
        ))}

        <div style={{ width:1, height:20, background:'var(--border-subtle)', margin:'0 4px' }} />

        <label style={{ fontFamily:'var(--font-mono)', fontSize:9, color:'var(--text-muted)', letterSpacing:'0.05em' }}>
          INCIDENT
        </label>
        <select
          value={incidentFilter}
          onChange={e => setIncidentFilter(e.target.value === 'All' ? 'All' : Number(e.target.value))}
          disabled={incidentOptions.length === 0}
          style={{
            fontFamily:'var(--font-mono)', fontSize:9, letterSpacing:'0.05em',
            padding:'6px 10px', borderRadius:4, cursor: incidentOptions.length ? 'pointer' : 'not-allowed',
            background: incidentFilter !== 'All' ? 'rgba(0,255,136,0.12)' : 'rgba(255,255,255,0.02)',
            border:`1px solid ${incidentFilter !== 'All' ? 'var(--accent-green)' : 'var(--border-subtle)'}`,
            color: incidentFilter !== 'All' ? 'var(--accent-green)' : 'var(--text-muted)',
          }}
        >
          <option value="All">All incidents ({incidentOptions.length})</option>
          {incidentOptions.map(id => (
            <option key={id} value={id}>#{id}</option>
          ))}
        </select>

        {incidentFilter !== 'All' && (
          <button onClick={() => setIncidentFilter('All')} style={{
            fontFamily:'var(--font-mono)', fontSize:8.5, color:'var(--text-muted)',
            background:'none', border:'none', cursor:'pointer', letterSpacing:'0.05em',
          }}>✕ clear</button>
        )}

        {(typeFilter !== 'All' || incidentFilter !== 'All') && (
          <div style={{ marginLeft:'auto', fontFamily:'var(--font-mono)', fontSize:9, color:'var(--text-muted)' }}>
            {filtered.length} of {changeHistory.length} shown
          </div>
        )}
      </div>

      <div style={{ padding:'20px 24px', maxWidth:900, margin:'0 auto' }}>
        {filtered.length === 0 ? (
          <div style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--text-muted)', textAlign:'center', padding:'40px 0' }}>
            {changeHistory.length === 0
              ? 'No recorded changes yet. Trigger an action or wait for an AI decision on an incident.'
              : 'No entries match the current filters.'}
          </div>
        ) : (
          filtered.map(entry => (
            <EntryRow
              key={entry.id}
              entry={entry}
              onFilterIncident={entry.incidentId != null ? () => setIncidentFilter(entry.incidentId) : undefined}
            />
          ))
        )}
      </div>
    </div>
  )
}
