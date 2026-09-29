/**
 * Profile Panel — user settings, priorities, report email
 */
import { useState, useRef } from 'react'
import { useProfileStore } from '../../store/useSHYENStore.js'

function Field({ label, value, onChange, type = 'text', placeholder }) {
  return (
    <div style={{ marginBottom:12 }}>
      <div style={{ fontFamily:'var(--font-mono)', fontSize:8, color:'var(--text-muted)', letterSpacing:'0.1em', marginBottom:4 }}>{label}</div>
      <input
        type={type} value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width:'100%', fontFamily:'var(--font-mono)', fontSize:10,
          background:'rgba(6,10,16,0.9)', border:'1px solid var(--border-mid)',
          color:'var(--text-primary)', borderRadius:4, padding:'7px 10px',
          outline:'none', boxSizing:'border-box',
        }}
      />
    </div>
  )
}

export default function ProfilePanel({ onClose }) {
  const profile    = useProfileStore()
  const fileRef    = useRef(null)
  const [tab, setTab] = useState('profile') // 'profile' | 'priorities' | 'email'
  const [saved, setSaved] = useState(false)

  const [form, setForm] = useState({
    name:         profile.name,
    organization: profile.organization,
    country:      profile.country,
    email:        profile.email,
    reportEmail:  profile.reportEmail,
  })

  const [newPriority, setNewPriority] = useState({ type:'asn', value:'', label:'' })

  function handlePhoto(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => profile.setPhoto(ev.target.result)
    reader.readAsDataURL(file)
  }

  function save() {
    profile.setProfile(form)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  function addPriority() {
    if (!newPriority.value.trim()) return
    profile.addPriority({
      type:    newPriority.type,
      value:   newPriority.value.trim(),
      label:   newPriority.label.trim() || newPriority.value.trim(),
      addedAt: new Date().toISOString(),
    })
    setNewPriority({ type:'asn', value:'', label:'' })
  }

  const TABS = [
    { key:'profile',    label:'PROFILE' },
    { key:'priorities', label:'PRIORITIES' },
    { key:'email',      label:'REPORT EMAIL' },
  ]

  return (
    <div style={{
      position:'fixed', top:64, right:16, width:380, maxHeight:'80vh',
      background:'rgba(6,10,18,0.98)', border:'1px solid var(--border-subtle)',
      borderRadius:8, zIndex:200, display:'flex', flexDirection:'column',
      boxShadow:'0 8px 40px rgba(0,0,0,0.6)', animation:'slideInRight 0.2s ease-out',
    }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 16px', borderBottom:'1px solid var(--border-subtle)' }}>
        <div style={{ fontFamily:'var(--font-display)', fontSize:13, fontWeight:700 }}>PROFILE & SETTINGS</div>
        <button onClick={onClose} style={{ background:'rgba(255,45,85,0.08)', border:'1px solid rgba(255,45,85,0.45)', color:'#ff2d55', cursor:'pointer', fontSize:14, borderRadius:4, width:28, height:28, display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 0 8px rgba(255,45,85,0.3)' }}>✕</button>
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', borderBottom:'1px solid var(--border-subtle)' }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            flex:1, padding:'8px 0', fontFamily:'var(--font-mono)', fontSize:8, letterSpacing:'0.08em',
            background:'none', border:'none', cursor:'pointer',
            color: tab === t.key ? 'var(--accent-green)' : 'var(--text-muted)',
            borderBottom:`2px solid ${tab === t.key ? 'var(--accent-green)' : 'transparent'}`,
          }}>{t.label}</button>
        ))}
      </div>

      <div style={{ flex:1, overflowY:'auto', padding:'16px' }}>
        {/* PROFILE TAB */}
        {tab === 'profile' && (
          <>
            {/* Photo */}
            <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:16 }}>
              <div
                onClick={() => fileRef.current?.click()}
                style={{
                  width:60, height:60, borderRadius:'50%', cursor:'pointer',
                  background: profile.photo ? 'transparent' : 'rgba(0,255,136,0.1)',
                  border:'2px solid rgba(0,255,136,0.3)',
                  display:'flex', alignItems:'center', justifyContent:'center',
                  overflow:'hidden', flexShrink:0,
                }}
              >
                {profile.photo
                  ? <img src={profile.photo} alt="profile" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                  : <span style={{ fontFamily:'var(--font-display)', fontSize:22, fontWeight:800, color:'var(--accent-green)' }}>{(form.name?.[0] ?? 'Y').toUpperCase()}</span>
                }
              </div>
              <div>
                <div style={{ fontFamily:'var(--font-display)', fontSize:14, fontWeight:700, marginBottom:2 }}>{form.name || 'Your Name'}</div>
                <div style={{ fontFamily:'var(--font-mono)', fontSize:9, color:'var(--text-muted)' }}>{form.organization || 'Organization'}</div>
                <button onClick={() => fileRef.current?.click()} style={{
                  fontFamily:'var(--font-mono)', fontSize:8, color:'var(--accent-blue)',
                  background:'none', border:'1px solid rgba(0,191,255,0.3)', borderRadius:2,
                  padding:'2px 8px', cursor:'pointer', marginTop:4,
                }}>CHANGE PHOTO</button>
              </div>
              <input ref={fileRef} type="file" accept="image/*" onChange={handlePhoto} style={{ display:'none' }} />
            </div>

            <Field label="FULL NAME" value={form.name} onChange={v => setForm(f => ({...f, name:v}))} placeholder="Your name" />
            <Field label="ORGANIZATION" value={form.organization} onChange={v => setForm(f => ({...f, organization:v}))} placeholder="Company / Institute" />
            <Field label="COUNTRY" value={form.country} onChange={v => setForm(f => ({...f, country:v}))} placeholder="Country" />
            <Field label="EMAIL" value={form.email} type="email" onChange={v => setForm(f => ({...f, email:v}))} placeholder="your@email.com" />

            <button onClick={save} style={{
              width:'100%', fontFamily:'var(--font-mono)', fontSize:10, fontWeight:700,
              color:'#000', background: saved ? '#30d158' : 'var(--accent-green)',
              border:'none', borderRadius:4, padding:'10px 0', cursor:'pointer', letterSpacing:'0.1em', transition:'background 0.2s',
            }}>{saved ? '✓ SAVED' : 'SAVE PROFILE'}</button>
          </>
        )}

        {/* PRIORITIES TAB */}
        {tab === 'priorities' && (
          <>
            <div style={{ fontFamily:'var(--font-mono)', fontSize:8, color:'var(--text-muted)', marginBottom:12, lineHeight:1.6 }}>
              Add specific ASNs, IP addresses, or prefixes to monitor with elevated priority. These will be highlighted in the incident list.
            </div>

            {/* Add form */}
            <div style={{ background:'rgba(255,255,255,0.02)', border:'1px solid var(--border-subtle)', borderRadius:4, padding:10, marginBottom:12 }}>
              <div style={{ fontFamily:'var(--font-mono)', fontSize:8, color:'var(--accent-green)', marginBottom:8, letterSpacing:'0.1em' }}>ADD PRIORITY TARGET</div>
              <div style={{ display:'flex', gap:6, marginBottom:6 }}>
                {['asn','prefix','ip'].map(t => (
                  <button key={t} onClick={() => setNewPriority(p => ({...p, type:t}))} style={{
                    flex:1, fontFamily:'var(--font-mono)', fontSize:8, padding:'4px 0',
                    background: newPriority.type === t ? 'var(--accent-green)' : 'none',
                    color: newPriority.type === t ? '#000' : 'var(--text-muted)',
                    border:'1px solid var(--border-subtle)', borderRadius:3, cursor:'pointer',
                    fontWeight: newPriority.type === t ? 700 : 400,
                  }}>{t.toUpperCase()}</button>
                ))}
              </div>
              <input value={newPriority.value} onChange={e => setNewPriority(p => ({...p, value:e.target.value}))}
                placeholder={newPriority.type === 'asn' ? 'e.g. AS55836' : newPriority.type === 'prefix' ? 'e.g. 103.47.140.0/22' : 'e.g. 103.47.140.1'}
                style={{ width:'100%', fontFamily:'var(--font-mono)', fontSize:9, background:'rgba(6,10,16,0.9)',
                  border:'1px solid var(--border-mid)', color:'var(--text-primary)', borderRadius:3,
                  padding:'6px 8px', outline:'none', boxSizing:'border-box', marginBottom:6 }} />
              <input value={newPriority.label} onChange={e => setNewPriority(p => ({...p, label:e.target.value}))}
                placeholder="Label (optional, e.g. My Bank)"
                style={{ width:'100%', fontFamily:'var(--font-mono)', fontSize:9, background:'rgba(6,10,16,0.9)',
                  border:'1px solid var(--border-mid)', color:'var(--text-primary)', borderRadius:3,
                  padding:'6px 8px', outline:'none', boxSizing:'border-box', marginBottom:8 }} />
              <button onClick={addPriority} style={{
                width:'100%', fontFamily:'var(--font-mono)', fontSize:9, fontWeight:700,
                color:'#000', background:'var(--accent-green)', border:'none', borderRadius:3, padding:'7px 0', cursor:'pointer',
              }}>+ ADD TO PRIORITY LIST</button>
            </div>

            {/* List */}
            {profile.priorities.length === 0 ? (
              <div style={{ fontFamily:'var(--font-mono)', fontSize:9, color:'var(--text-muted)', textAlign:'center', padding:20 }}>
                No priority targets yet
              </div>
            ) : (
              profile.priorities.map(p => (
                <div key={p.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 10px', marginBottom:4, background:'rgba(255,255,255,0.02)', border:'1px solid var(--border-subtle)', borderRadius:4 }}>
                  <span style={{ fontFamily:'var(--font-mono)', fontSize:8, color:'#ffd60a', background:'rgba(255,214,10,0.12)', border:'1px solid rgba(255,214,10,0.3)', borderRadius:2, padding:'1px 5px', flexShrink:0 }}>{p.type.toUpperCase()}</span>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontFamily:'var(--font-mono)', fontSize:9, color:'var(--text-primary)' }}>{p.value}</div>
                    {p.label !== p.value && <div style={{ fontFamily:'var(--font-mono)', fontSize:8, color:'var(--text-muted)' }}>{p.label}</div>}
                  </div>
                  <button onClick={() => profile.removePriority(p.id)} style={{ background:'rgba(255,45,85,0.08)', border:'1px solid rgba(255,45,85,0.35)', color:'#ff2d55', cursor:'pointer', fontSize:11, flexShrink:0, borderRadius:3, width:20, height:20, display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 0 5px rgba(255,45,85,0.25)' }}>✕</button>
                </div>
              ))
            )}
          </>
        )}

        {/* REPORT EMAIL TAB */}
        {tab === 'email' && (
          <>
            <div style={{ fontFamily:'var(--font-mono)', fontSize:8, color:'var(--text-muted)', marginBottom:16, lineHeight:1.6 }}>
              Configure the email address where forensic reports and incident alerts will be sent automatically.
            </div>

            <Field
              label="PRIMARY EMAIL"
              value={form.email}
              type="email"
              onChange={v => setForm(f => ({...f, email:v}))}
              placeholder="your@email.com"
            />

            <div style={{ height:1, background:'var(--border-subtle)', margin:'12px 0' }} />

            <div style={{ fontFamily:'var(--font-mono)', fontSize:9, color:'var(--accent-green)', marginBottom:8, letterSpacing:'0.1em' }}>
              FORENSIC REPORT DESTINATION
            </div>
            <div style={{ fontFamily:'var(--font-mono)', fontSize:8, color:'var(--text-muted)', marginBottom:10, lineHeight:1.6 }}>
              CERT-In PDF reports will be sent here when you click FORENSICS on an incident. Leave blank to use primary email.
            </div>

            <Field
              label="FORENSIC REPORT EMAIL"
              value={form.reportEmail}
              type="email"
              onChange={v => setForm(f => ({...f, reportEmail:v}))}
              placeholder="security@yourorg.com"
            />

            <div style={{ padding:'8px 10px', background:'rgba(0,255,136,0.04)', border:'1px solid rgba(0,255,136,0.15)', borderRadius:4, marginBottom:12 }}>
              <div style={{ fontFamily:'var(--font-mono)', fontSize:8, color:'var(--accent-green)', marginBottom:4 }}>CURRENT SETTINGS</div>
              <div style={{ fontFamily:'var(--font-mono)', fontSize:9, color:'var(--text-secondary)' }}>
                Reports → {form.reportEmail || form.email || 'not configured'}
              </div>
            </div>

            <button onClick={save} style={{
              width:'100%', fontFamily:'var(--font-mono)', fontSize:10, fontWeight:700,
              color:'#000', background: saved ? '#30d158' : 'var(--accent-green)',
              border:'none', borderRadius:4, padding:'10px 0', cursor:'pointer', letterSpacing:'0.1em', transition:'background 0.2s',
            }}>{saved ? '✓ SAVED' : 'SAVE EMAIL SETTINGS'}</button>
          </>
        )}
      </div>
    </div>
  )
}
