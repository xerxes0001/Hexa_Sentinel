/**
 * hexasentinelAPI.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Drop-in replacement for:
 *   groqAPI.js        → analyzeIncidentLocal()
 *   groqActions.js    → chatWithHexaSentinel(), generateCERTInReport(),
 *                        generateISPNotification()
 *   autonomousAI.js   → queryHexaSentinel(), getDecision()
 *   supabaseClient.js → removed (no cloud DB)
 *   backendSync.js    → removed (in-memory only)
 *
 * All requests go to the on-device FastAPI server at 127.0.0.1:8000.
 * AI is powered by Llama 3.2 3B Instruct (Qualcomm AI Hub) on the Hexagon NPU.
 * Zero cloud calls. Zero API keys required at runtime.
 */

const BASE = import.meta.env.VITE_HEXASENTINEL_API_URL ?? 'http://127.0.0.1:8000'

const OFFLINE_MSG =
  'HexaSentinel backend unavailable. Start the Python server:\n' +
  '  uvicorn backend.api.main:app --host 127.0.0.1 --port 8000'

// ── Helpers ──────────────────────────────────────────────────────────────────
async function post(path, body, signal) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${path}`)
  return res.json()
}

// ── 1. analyzeIncidentLocal ───────────────────────────────────────────────────
// Drop-in for analyzeIncident() in groqAPI.js
// Called by: src/components/detail/AIAnalysis.jsx
export async function analyzeIncidentLocal(incident, signal) {
  try {
    const data = await post('/api/analyze', { context: incident }, signal)
    return data.analysis ?? 'Analysis unavailable.'
  } catch (err) {
    if (err.name === 'AbortError') throw err
    console.warn('[HexaSentinel] analyzeIncidentLocal failed:', err.message)
    return OFFLINE_MSG
  }
}

// ── 2. chatWithHexaSentinel ─────────────────────────────────────────────────────
// Drop-in for chatWithGroq() in groqActions.js
// Called by: src/components/chat/AdminChat.jsx
export async function chatWithHexaSentinel(messages, systemContext, _unused, signal) {
  try {
    const data = await post('/api/chat', { messages, context: systemContext }, signal)
    return data.reply ?? 'No response.'
  } catch (err) {
    if (err.name === 'AbortError') throw err
    console.warn('[HexaSentinel] chatWithHexaSentinel failed:', err.message)
    return OFFLINE_MSG
  }
}

// ── 3. queryHexaSentinel ────────────────────────────────────────────────────────
// Drop-in for callTextAI() in autonomousAI.js
// Called by: src/components/detail/ConversationalQuery.jsx
export async function queryHexaSentinel(systemPrompt, userContent, _maxTokens, _temperature) {
  try {
    const data = await post('/api/chat', {
      messages: [{ role: 'user', content: userContent }],
      context:  systemPrompt,
    })
    return data.reply ?? null
  } catch (err) {
    console.warn('[HexaSentinel] queryHexaSentinel failed:', err.message)
    return null
  }
}

// ── 4. getDecision ────────────────────────────────────────────────────────────
// Drop-in for autonomousDecision() in autonomousAI.js
// Called by: src/App.jsx (enrichAndAdd pipeline)
// Sends a rich BGP incident context to Llama 3.2 3B on the Hexagon NPU.
export async function getDecision(incident, _onAnalyzing) {
  try {
    // Serialize the BGP incident into a structured context object
    // that the Llama analyst knows how to interpret
    const bgpContext = {
      type:            'bgp_incident',
      prefix:          incident.prefix          ?? 'unknown',
      attacker_asn:    incident.attacker?.asn   ?? 'unknown',
      attacker_name:   incident.attacker?.name  ?? 'unknown',
      attacker_country:incident.attacker?.country ?? '??',
      victim_asn:      incident.victim?.asn     ?? 'unknown',
      victim_name:     incident.victim?.name    ?? 'unknown',
      victim_sector:   incident.victim?.sector  ?? 'unknown',
      severity:        incident.severity        ?? 'MEDIUM',
      path_anomaly:    incident.pathAnomaly     ?? 'none',
      confidence:      incident.confidence      ?? 50,
      is_repeat:       incident.isRepeatAttacker ?? false,
      repeat_count:    incident.repeatCount     ?? 1,
      coordinated:     !!incident.coordinatedAttack,
      affected_prefixes: incident.affectedPrefixes ?? [],
      countermeasures_ready: incident.countermeasuresReady ?? false,
      rpki_state:      incident.rpkiStatus?.valid ? 'valid' : incident.rpkiStatus?.invalid ? 'invalid' : 'unknown',
      summary:         incident.deterministicSummary ?? '',
    }
    const data = await post('/api/analyze', { context: bgpContext })
    const text = data.analysis ?? ''
    const isCritical = /CRITICAL/i.test(text)
    const isWarning  = /WARNING/i.test(text)
    // Return the same shape autonomousDecision() returned so all
    // downstream store/UI code that reads .mode .threatLevel .reasoning works
    return {
      mode:            'autonomous',
      threatLevel:     isCritical ? 'CRITICAL' : isWarning ? 'HIGH' : 'MEDIUM',
      attackConfirmed: true,
      reasoning:       text.split('\n').find(l => l.startsWith('WHAT HAPPENED'))?.slice(14)
                       ?? text.split('\n')[0]?.slice(0, 120)
                       ?? text.slice(0, 120),
      rawReport:       text,
      severity:        isCritical ? 'CRITICAL' : isWarning ? 'HIGH' : 'MEDIUM',
      _source:         'hexasentinel-llama-npu',
    }
  } catch (err) {
    console.warn('[HexaSentinel] getDecision failed:', err.message)
    return null
  }
}

// ── 5. generateCERTInReport ───────────────────────────────────────────────────
// Drop-in for generateCERTInReport() in groqActions.js
// Called by: src/components/detail/ForensicsReport.jsx
export async function generateCERTInReport(incident, analysis, _unused, signal) {
  try {
    const data = await post('/api/reports/certin', { incident, analysis }, signal)
    return data
  } catch (err) {
    if (err.name === 'AbortError') throw err
    console.warn('[HexaSentinel] generateCERTInReport failed:', err.message)
    return { id: 'N/A', text: OFFLINE_MSG, generatedAt: new Date().toISOString() }
  }
}

// ── 6. generateISPNotification ────────────────────────────────────────────────
// Drop-in for generateISPNotification() in groqActions.js
// Called by: src/components/detail/ForensicsReport.jsx, ResponseActions.jsx
export async function generateISPNotification(incident, analysis, _unused, signal) {
  try {
    const data = await post('/api/reports/isp', { incident, analysis }, signal)
    return data.text ?? OFFLINE_MSG
  } catch (err) {
    if (err.name === 'AbortError') throw err
    console.warn('[HexaSentinel] generateISPNotification failed:', err.message)
    return OFFLINE_MSG
  }
}

// ── 7. connectThreatStream ────────────────────────────────────────────────────
// Connects to the FastAPI WebSocket for real-time packet-level threat events.
// Called by: src/App.jsx  (one connection for the lifetime of the app)
// Receives: { type:'threat'|'heartbeat', label, confidence, report, features, timestamp }
export function connectThreatStream(onEvent, onStatusChange) {
  const url = `ws://127.0.0.1:8000/ws`
  let ws

  function connect() {
    ws = new WebSocket(url)

    ws.onopen = () => {
      console.log('[HexaSentinel] WebSocket connected — live threat stream active')
      onStatusChange?.('connected')
      // Heartbeat keepalive every 25s
      ws._pingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send('ping')
      }, 25000)
    }

    ws.onmessage = (e) => {
      try {
        const ev = JSON.parse(e.data)
        onEvent(ev)
        // Broadcast to SeverityMeter and NPUStatusBadge via custom event bus
        window.dispatchEvent(new CustomEvent('hexasentinel:threat', { detail: JSON.stringify(ev) }))
      } catch { /* ignore malformed */ }
    }

    ws.onclose = () => {
      console.warn('[HexaSentinel] WebSocket closed — retrying in 5s')
      clearInterval(ws._pingInterval)
      onStatusChange?.('disconnected')
      setTimeout(connect, 5000)   // auto-reconnect
    }

    ws.onerror = (err) => {
      console.warn('[HexaSentinel] WebSocket error — backend may not be running')
      onStatusChange?.('error')
    }
  }

  connect()

  return {
    close: () => {
      if (ws) { clearInterval(ws._pingInterval); ws.onclose = null; ws.close() }
    },
  }
}

// ── 8. checkHealth ────────────────────────────────────────────────────────────
// Utility — check if the HexaSentinel backend is reachable
export async function checkHealth() {
  try {
    const res = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(3000) })
    return res.ok ? await res.json() : null
  } catch {
    return null
  }
}
