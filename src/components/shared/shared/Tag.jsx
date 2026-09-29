export default function Tag({ color, children }) {
  return (
    <span style={{
      fontFamily: 'var(--font-mono)',
      fontSize: 8,
      padding: '2px 6px',
      border: `1px solid ${color}40`,
      borderRadius: 2,
      color,
      letterSpacing: 0.5,
    }}>
      {children}
    </span>
  )
}
