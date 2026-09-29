/**
 * RPKI Gap Scanner Panel — proactive security posture view.
 * Scans all 42 monitored Indian ASNs / 89 prefixes against live RPKI data
 * and surfaces which ones have NO ROA coverage right now, before any hijack.
 */
import { useState } from 'react'
import { scanRPKIGaps, summarizeGaps, generateProactiveROA, getScanHistory, saveScanToHistory, computeTrend } from '../../engine/rpkiGapScanner.js'
import { computeManrsScorecard } from '../../engine/manrsScorecard.js'

const SECTOR_COLORS = { Financial:'#ff2d55', Government:'#ffd60a', Defense:'#ff6b00', Telecom:'#00bfff', ISP:'#00ff88', IXP:'#bf5af2' }

function CoverageBar({ pct }) {
  const color = pct >= 80 ? '#30d158' : pct >= 50 ? '#ffd60a' : '#ff2d55'
  return (
    <div style={{ width:'100%', height:8, background:'rgba(255,255,255,0.06)', borderRadius:4, overflow:'hidden' }}>
      <div style={{ width:`${pct}%`, height:'100%', background:color, transition:'width 0.4s ease-out' }} />
    </div>
  )
}

function GapRow({ gap }) {
  const [showROA, setShowROA] = useState(false)
  const [copied, setCopied]   = useState(false)
  const roa = showROA ? generateProactiveROA(gap) : null

  async function copy() {
    try { await navigator.clipboard.writeText(roa) } catch {}
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  return (
    <div style={{ border:'1px solid var(--border-subtle)', borderRadius:4, marginBottom:6, overflow:'hidden' }}>
      <div style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 12px', background:'rgba(255,45,85,0.04)' }}>
        <span style={{
          fontFamily:'var(--font-mono)', fontSize:8, color:SECTOR_COLORS[gap.sector] ?? '#888',
          border:`1px solid ${SECTOR_COLORS[gap.sector] ?? '#888'}44`, borderRadius:2, padding:'1px 5px', flexShrink:0,
        }}>{gap.sector}</span>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontFamily:'var(--font-display)', fontSize:11, fontWeight:700, color:'var(--text-primary)' }}>{gap.name}</div>
          <div style={{ fontFamily:'var(--font-mono)', fontSize:8.5, color:'var(--text-secondary)' }}>{gap.asn} · {gap.prefix}</div>
        </div>
        <span style={{ fontFamily:'var(--font-mono)', fontSize:8, color:'#ff2d55', letterSpacing:0.5, flexShrink:0 }}>
          ⚠ NO ROA
        </span>
        <button onClick={() => setShowROA(v => !v)} style={{
          fontFamily:'var(--font-mono)', fontSize:8, padding:'5px 10px', flexShrink:0,
          background:'none', border:'1px solid rgba(0,191,255,0.5)', color:'var(--accent-blue)',
          cursor:'pointer', borderRadius:2, letterSpacing:1, whiteSpace:'nowrap',
        }}>{showROA ? 'HIDE' : 'GENERATE ROA'}</button>
      </div>
      {showROA && (
        <div>
          <div style={{ display:'flex', justifyContent:'flex-end', padding:'6px 12px 0' }}>
            <button onClick={copy} style={{
              fontFamily:'var(--font-mono)', fontSize:8, padding:'4px 9px',
              background:'none', border:'1px solid rgba(0,191,255,0.5)', color:'var(--accent-blue)',
              cursor:'pointer', borderRadius:2, letterSpacing:1,
            }}>{copied ? '✓ COPIED' : 'COPY'}</button>
          </div>
          <pre style={{
            margin:0, padding:'8px 12px 12px', fontFamily:'var(--font-mono)', fontSize:8.5,
            color:'var(--text-primary)', background:'rgba(6,10,16,0.9)', lineHeight:1.6,
            whiteSpace:'pre-wrap', wordBreak:'break-word', maxHeight:180, overflowY:'auto',
          }}>{roa}</pre>
        </div>
      )}
    </div>
  )
}

function ManrsScorecard({ summary }) {
  const scorecard = computeManrsScorecard(summary)
  return (
    <div style={{ background:'rgba(10,18,28,0.8)', border:'1px solid var(--border-subtle)', borderRadius:6, padding:20, marginBottom:24 }}>
      <div style={{ display:'flex', alignItems:'baseline', justifyContent:'space-between', marginBottom:4 }}>
        <div style={{ fontFamily:'var(--font-display)', fontSize:13, fontWeight:700 }}>MANRS COMPLIANCE SCORECARD</div>
        <span style={{ fontFamily:'var(--font-mono)', fontSize:8, color:'var(--text-muted)' }}>
          {scorecard.measurableCount}/{scorecard.totalActions} actions measurable from current data
        </span>
      </div>
      <div style={{ fontFamily:'var(--font-mono)', fontSize:8.5, color:'var(--text-muted)', marginBottom:14, lineHeight:1.6 }}>
        MANRS (Mutually Agreed Norms for Routing Security) is the real Internet Society industry framework —{' '}
        <span style={{ color:'var(--text-secondary)' }}>manrs.org</span>. HexaSentinel only claims a real score where its
        actual data sources support one; the other actions are shown honestly as unmeasured rather than faked.
      </div>
      {scorecard.actions.map(action => (
        <div key={action.id} style={{
          display:'flex', alignItems:'flex-start', gap:12, padding:'10px 0',
          borderTop: '1px solid var(--border-subtle)',
        }}>
          <div style={{
            flexShrink:0, width:48, textAlign:'center', fontFamily:'var(--font-display)', fontSize:16, fontWeight:800,
            color: action.measurable ? (action.score >= 80 ? '#30d158' : action.score >= 50 ? '#ffd60a' : '#ff2d55') : 'var(--text-muted)',
          }}>
            {action.measurable ? `${action.score ?? '—'}%` : '—'}
          </div>
          <div style={{ flex:1 }}>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <span style={{ fontFamily:'var(--font-mono)', fontSize:9, fontWeight:700, color:'var(--text-primary)' }}>{action.name}</span>
              {action.measurable
                ? <span style={{ fontFamily:'var(--font-mono)', fontSize:7, color:'#30d158', border:'1px solid #30d15844', borderRadius:2, padding:'1px 4px' }}>MEASURED</span>
                : <span style={{ fontFamily:'var(--font-mono)', fontSize:7, color:'var(--text-muted)', border:'1px solid var(--border-mid)', borderRadius:2, padding:'1px 4px' }}>NOT MEASURABLE</span>
              }
            </div>
            <div style={{ fontFamily:'var(--font-mono)', fontSize:8, color:'var(--text-secondary)', marginTop:3, lineHeight:1.6 }}>
              {action.description}
            </div>
            {!action.measurable && (
              <div style={{ fontFamily:'var(--font-mono)', fontSize:7.5, color:'var(--text-muted)', marginTop:3, fontStyle:'italic' }}>
                {action.reason}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

export default function RPKIGapPanel({ onClose }) {
  const [scanning, setScanning] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [summary,  setSummary]  = useState(null)
  const [trend,    setTrend]    = useState(null)

  async function runScan() {
    setScanning(true)
    setSummary(null)
    setTrend(null)
    setProgress({ done: 0, total: 0 })
    const results = await scanRPKIGaps((done, total) => setProgress({ done, total }))
    const newSummary = summarizeGaps(results)
    // Capture trend against history BEFORE this scan gets saved into it —
    // comparing against the most recent PRIOR scan, not against itself.
    const priorHistory = getScanHistory()
    setTrend(computeTrend(newSummary, priorHistory))
    saveScanToHistory(newSummary)
    setSummary(newSummary)
    setScanning(false)
  }

  return (
    <div style={{
      position:'fixed', inset:0, zIndex:200,
      background:'rgba(4,7,14,0.97)', overflowY:'auto',
      animation:'fadeIn 0.2s ease-out',
    }}>
      {/* Header */}
      <div style={{ position:'sticky', top:0, background:'rgba(4,7,14,0.98)', borderBottom:'1px solid var(--border-subtle)', padding:'12px 24px', display:'flex', alignItems:'center', justifyContent:'space-between', zIndex:10 }}>
        <div>
          <div style={{ fontFamily:'var(--font-display)', fontSize:18, fontWeight:800 }}>RPKI GAP SCANNER</div>
          <div style={{ fontFamily:'var(--font-mono)', fontSize:9, color:'var(--text-muted)', marginTop:2 }}>
            Proactive posture check — which monitored prefixes have no ROA coverage right now, before anything is hijacked
          </div>
        </div>
        <button onClick={onClose} style={{
          fontFamily:'var(--font-mono)', fontSize:9, color:'#ff2d55',
          background:'rgba(255,45,85,0.08)', border:'1px solid rgba(255,45,85,0.45)',
          borderRadius:4, padding:'6px 14px', cursor:'pointer', boxShadow:'0 0 8px rgba(255,45,85,0.3)',
        }}>✕ CLOSE</button>
      </div>

      <div style={{ padding:24, maxWidth:900, margin:'0 auto' }}>
        {/* Scan trigger */}
        <div style={{ background:'rgba(10,18,28,0.8)', border:'1px solid var(--border-subtle)', borderRadius:6, padding:20, marginBottom:24 }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom: scanning || summary ? 14 : 0 }}>
            <div>
              <div style={{ fontFamily:'var(--font-display)', fontSize:13, fontWeight:700 }}>
                42 ASNs · 89 monitored prefixes
              </div>
              <div style={{ fontFamily:'var(--font-mono)', fontSize:9, color:'var(--text-muted)', marginTop:2 }}>
                Cross-checked live against Cloudflare's RPKI validity API
              </div>
            </div>
            <button onClick={runScan} disabled={scanning} style={{
              fontFamily:'var(--font-display)', fontSize:11, fontWeight:700, letterSpacing:1,
              padding:'9px 18px', borderRadius:4, cursor: scanning ? 'wait' : 'pointer',
              background: scanning ? 'rgba(0,255,136,0.08)' : 'rgba(0,255,136,0.14)',
              border:'1px solid rgba(0,255,136,0.5)', color:'var(--accent-green)',
            }}>{scanning ? '⏳ SCANNING…' : '▶ RUN SCAN'}</button>
          </div>

          {scanning && (
            <div>
              <CoverageBar pct={progress.total ? (progress.done / progress.total) * 100 : 0} />
              <div style={{ fontFamily:'var(--font-mono)', fontSize:8.5, color:'var(--text-muted)', marginTop:6 }}>
                {progress.done} / {progress.total} prefixes checked…
              </div>
            </div>
          )}

          {summary && !scanning && (
            <div>
              <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8, flexWrap:'wrap' }}>
                <span style={{ fontFamily:'var(--font-display)', fontSize:20, fontWeight:800, color: summary.coveragePct >= 80 ? '#30d158' : summary.coveragePct >= 50 ? '#ffd60a' : '#ff2d55' }}>
                  {summary.coveragePct}%
                </span>
                <span style={{ fontFamily:'var(--font-mono)', fontSize:9, color:'var(--text-secondary)' }}>
                  RPKI coverage · {summary.coveredCount} covered, {summary.gapCount} gaps, {summary.invalidCount} invalid
                </span>
                {trend && (
                  <span style={{
                    fontFamily:'var(--font-mono)', fontSize:9, fontWeight:700, padding:'2px 8px', borderRadius:3,
                    color: trend.direction === 'improved' ? '#30d158' : trend.direction === 'declined' ? '#ff2d55' : 'var(--text-muted)',
                    border: `1px solid ${trend.direction === 'improved' ? '#30d15866' : trend.direction === 'declined' ? '#ff2d5566' : 'var(--border-mid)'}`,
                  }}>
                    {trend.direction === 'improved' ? '↑' : trend.direction === 'declined' ? '↓' : '→'} {Math.abs(trend.delta)}pt since last scan ({trend.previousPct}%)
                  </span>
                )}
                {!trend && (
                  <span style={{ fontFamily:'var(--font-mono)', fontSize:8, color:'var(--text-muted)', fontStyle:'italic' }}>
                    first scan recorded — trend will show from the next scan
                  </span>
                )}
              </div>
              <CoverageBar pct={summary.coveragePct} />
            </div>
          )}
        </div>

        {summary && !scanning && <ManrsScorecard summary={summary} />}

        {/* Gap list */}
        {summary && summary.gapList.length > 0 && (
          <div>
            <div style={{ fontFamily:'var(--font-mono)', fontSize:9, fontWeight:700, color:'#ff2d55', letterSpacing:'0.1em', marginBottom:10 }}>
              ⚠ {summary.gapList.length} PREFIXES WITH NO ROA COVERAGE — SORTED BY SECTOR SENSITIVITY
            </div>
            {summary.gapList.map((gap, i) => <GapRow key={`${gap.asn}-${gap.prefix}-${i}`} gap={gap} />)}
          </div>
        )}

        {summary && summary.gapList.length === 0 && (
          <div style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--accent-green)', padding:'20px 0', textAlign:'center' }}>
            ✓ Full RPKI coverage — every monitored prefix has a valid ROA.
          </div>
        )}

        {!summary && !scanning && (
          <div style={{ fontFamily:'var(--font-mono)', fontSize:9, color:'var(--text-muted)', padding:'20px 0', textAlign:'center' }}>
            Run a scan to see which monitored prefixes are currently unprotected.
          </div>
        )}
      </div>
    </div>
  )
}
