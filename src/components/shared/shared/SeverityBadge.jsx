const COLORS = {
  CRITICAL: { bg: 'rgba(255,45,85,0.15)',   color: '#ff2d55', border: 'rgba(255,45,85,0.3)'  },
  HIGH:     { bg: 'rgba(255,107,0,0.15)',   color: '#ff6b00', border: 'rgba(255,107,0,0.3)'  },
  MEDIUM:   { bg: 'rgba(255,214,10,0.12)',  color: '#ffd60a', border: 'rgba(255,214,10,0.25)' },
  LOW:      { bg: 'rgba(48,209,88,0.10)',   color: '#30d158', border: 'rgba(48,209,88,0.25)' },
}

export default function SeverityBadge({ severity }) {
  const c = COLORS[severity] ?? COLORS.LOW
  return (
    <span style={{
      fontFamily: 'var(--font-mono)',
      fontSize: 8,
      padding: '3px 8px',
      borderRadius: 2,
      letterSpacing: 1,
      fontWeight: 700,
      background: c.bg,
      color: c.color,
      border: `1px solid ${c.border}`,
    }}>
      {severity}
    </span>
  )
}
