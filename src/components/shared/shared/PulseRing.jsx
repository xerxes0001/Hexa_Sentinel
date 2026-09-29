export default function PulseRing({ color, size = 10, active }) {
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <div style={{
        width: size - 2, height: size - 2,
        borderRadius: '50%',
        background: color,
        position: 'absolute',
        top: 1, left: 1,
      }} />
      {active && (
        <div style={{
          position: 'absolute',
          inset: -2,
          borderRadius: '50%',
          border: `1px solid ${color}`,
          animation: 'pulseRing 1.5s ease-out infinite',
        }} />
      )}
    </div>
  )
}
