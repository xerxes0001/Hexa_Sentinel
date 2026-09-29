/**
 * PanelErrorBoundary — catches render errors in the AI SOC Analyst panel
 * Without this, ANY render throw (e.g. null timestamp, undefined field access)
 * causes the entire right panel to go permanently black with no recovery.
 */
import { Component } from 'react'

export default class PanelErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    console.error('[HexaSentinel Panel] Render error caught by boundary:', error, info)
  }

  componentDidUpdate(prevProps) {
    // Auto-recover when the incident changes — clear the error state
    // so the panel re-renders fresh for the new incident
    if (prevProps.incidentId !== this.props.incidentId && this.state.hasError) {
      this.setState({ hasError: false, error: null })
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: 20, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          gap: 12, height: '100%',
        }}>
          <div style={{ width: 36, height: 36, borderRadius: '50%',
            border: '1px solid rgba(255,45,85,0.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{ color: '#ff2d55', fontSize: 16 }}>!</span>
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10,
            color: 'var(--text-muted)', letterSpacing: '0.1em', textAlign: 'center',
          }}>
            PANEL RENDER ERROR
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8,
            color: '#333', textAlign: 'center', lineHeight: 1.6,
          }}>
            {this.state.error?.message ?? 'Unknown error'}
          </div>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{
              fontFamily: 'var(--font-mono)', fontSize: 9, color: '#00bfff',
              background: 'none', border: '1px solid rgba(0,191,255,0.3)',
              borderRadius: 3, padding: '4px 12px', cursor: 'pointer',
              letterSpacing: '0.08em',
            }}
          >
            RETRY
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
