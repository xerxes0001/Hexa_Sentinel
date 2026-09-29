/**
 * VoiceQuery
 * Push-to-talk microphone button that streams audio to the FastAPI
 * /api/voice endpoint → Whisper-Base-En (Hexagon NPU) → Llama 3.2 3B.
 *
 * Usage:
 *   <VoiceQuery onAnswer={(transcript, answer) => ...} context="..." />
 */

import { useState, useRef, useEffect } from 'react'

const BASE = import.meta.env.VITE_HEXASENTINEL_API_URL ?? 'http://127.0.0.1:8000'

const STATE = {
  IDLE:         'idle',
  RECORDING:    'recording',
  PROCESSING:   'processing',
  DONE:         'done',
  ERROR:        'error',
  UNAVAILABLE:  'unavailable',
}

const LABEL = {
  [STATE.IDLE]:        '🎙 Voice Query',
  [STATE.RECORDING]:   '⏹ Stop Recording',
  [STATE.PROCESSING]:  '⏳ Processing…',
  [STATE.DONE]:        '✓ Done',
  [STATE.ERROR]:       '⚠ Error',
  [STATE.UNAVAILABLE]: '🎙 Unavailable',
}

const HINT = {
  [STATE.IDLE]:       'Ask a question about the current threat landscape',
  [STATE.RECORDING]:  'Speak your query — click Stop when done',
  [STATE.PROCESSING]: 'Whisper + Llama 3.2 3B on Hexagon NPU…',
  [STATE.DONE]:       '',
  [STATE.ERROR]:      'Check that the Python backend is running',
  [STATE.UNAVAILABLE]:'Whisper model not loaded — text query still works',
}

export default function VoiceQuery({ onAnswer, context = '' }) {
  const [state,      setState]      = useState(STATE.IDLE)
  const [transcript, setTranscript] = useState('')
  const [answer,     setAnswer]     = useState('')
  const [available,  setAvailable]  = useState(null)   // null = unchecked
  const mediaRef    = useRef(null)
  const chunksRef   = useRef([])
  const streamRef   = useRef(null)

  // Check Whisper availability on mount
  useEffect(() => {
    fetch(`${BASE}/api/voice/status`)
      .then(r => r.json())
      .then(d => setAvailable(d.whisper_available))
      .catch(() => setAvailable(false))
  }, [])

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { sampleRate: 16000, channelCount: 1 } })
      streamRef.current = stream
      const recorder    = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' })
      mediaRef.current  = recorder
      chunksRef.current = []

      recorder.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      recorder.onstop = () => sendAudio()
      recorder.start(100)
      setState(STATE.RECORDING)
      setTranscript('')
      setAnswer('')
    } catch (err) {
      console.error('[VoiceQuery] Mic error:', err)
      setState(STATE.ERROR)
    }
  }

  const stopRecording = () => {
    mediaRef.current?.stop()
    streamRef.current?.getTracks().forEach(t => t.stop())
    setState(STATE.PROCESSING)
  }

  const sendAudio = async () => {
    const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
    const form = new FormData()
    form.append('audio',   blob, 'query.webm')
    form.append('context', context)

    try {
      const res  = await fetch(`${BASE}/api/voice`, { method: 'POST', body: form })
      const data = await res.json()

      if (data.error) throw new Error(data.error)

      setTranscript(data.transcript ?? '')
      setAnswer(data.answer ?? '')
      setState(STATE.DONE)
      onAnswer?.(data.transcript, data.answer)

      // Reset to idle after 4s
      setTimeout(() => setState(STATE.IDLE), 4000)
    } catch (err) {
      console.error('[VoiceQuery] Send error:', err)
      setState(STATE.ERROR)
      setTimeout(() => setState(STATE.IDLE), 3000)
    }
  }

  const handleClick = () => {
    if (state === STATE.RECORDING) stopRecording()
    else if (state === STATE.IDLE || state === STATE.DONE || state === STATE.ERROR) startRecording()
  }

  const isRecording  = state === STATE.RECORDING
  const isProcessing = state === STATE.PROCESSING
  const isDisabled   = isProcessing || available === false

  const btnColor = isRecording ? 'var(--accent-red)' : state === STATE.DONE ? 'var(--accent-green)' : 'var(--accent-cyan, #0CD4F5)'

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
      {/* Button */}
      <button
        onClick={handleClick}
        disabled={isDisabled}
        title={available === false ? 'Whisper model not loaded on Hexagon NPU' : 'Click to start voice query'}
        style={{
          display:'flex', alignItems:'center', gap:7,
          padding:'6px 14px', borderRadius:5, cursor: isDisabled ? 'not-allowed' : 'pointer',
          background: isRecording ? 'rgba(255,45,85,0.12)' : 'rgba(12,212,245,0.07)',
          border: `1px solid ${btnColor}`,
          color: isDisabled ? 'var(--text-muted)' : btnColor,
          fontFamily:'var(--font-mono)', fontSize:10, fontWeight:700,
          letterSpacing:'0.06em',
          transition:'all 0.15s',
          opacity: isDisabled ? 0.5 : 1,
          animation: isRecording ? 'voicePulse 1.2s ease infinite' : 'none',
        }}
      >
        {LABEL[state]}
        {isRecording && (
          <span style={{ display:'flex', gap:2 }}>
            {[...Array(3)].map((_, i) => (
              <span key={i} style={{
                display:'inline-block', width:3, height:3, borderRadius:'50%',
                background:'var(--accent-red)',
                animation:`voiceDot 1.2s ${i*0.2}s ease infinite`,
              }}/>
            ))}
          </span>
        )}
      </button>

      {/* Hint line */}
      {HINT[state] && (
        <div style={{ fontFamily:'var(--font-mono)', fontSize:8, color:'var(--text-muted)' }}>
          {HINT[state]}
        </div>
      )}

      {/* Transcript + answer */}
      {transcript && (
        <div style={{ marginTop:4 }}>
          <div style={{ fontFamily:'var(--font-mono)', fontSize:8, color:'var(--text-muted)', marginBottom:3 }}>
            TRANSCRIPT
          </div>
          <div style={{ fontFamily:'var(--font-mono)', fontSize:9, color:'var(--text-secondary)', background:'rgba(255,255,255,0.03)', padding:'5px 8px', borderRadius:4, lineHeight:1.5 }}>
            "{transcript}"
          </div>
          {answer && (
            <>
              <div style={{ fontFamily:'var(--font-mono)', fontSize:8, color:'var(--accent-cyan,#0CD4F5)', margin:'6px 0 3px', letterSpacing:'0.06em' }}>
                HEXASENTINEL AI · HEXAGON NPU
              </div>
              <div style={{ fontFamily:'var(--font-mono)', fontSize:9, color:'var(--text-secondary)', background:'rgba(12,212,245,0.04)', border:'1px solid rgba(12,212,245,0.1)', padding:'6px 8px', borderRadius:4, lineHeight:1.6, whiteSpace:'pre-wrap' }}>
                {answer}
              </div>
            </>
          )}
        </div>
      )}

      <style>{`
        @keyframes voicePulse { 0%,100%{box-shadow:0 0 0 0 rgba(255,45,85,0.3)} 50%{box-shadow:0 0 0 6px rgba(255,45,85,0)} }
        @keyframes voiceDot { 0%,100%{transform:scaleY(1)} 50%{transform:scaleY(2.5)} }
      `}</style>
    </div>
  )
}
