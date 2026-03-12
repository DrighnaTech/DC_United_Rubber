import { useState, useEffect } from 'react'
import { useOutletContext } from 'react-router-dom'

const PROJECTS = [
  // {
  //   id: 'standard',
  //   name: 'United Rubber',
  //   subtitle: 'Sales Analytics',
  //   url: import.meta.env.VITE_DASHBOARD_URL || 'http://localhost:3000',
  //   color: '#f07b1c',
  // },
  {
    id: '3month',
    name: 'United Rubber',
    subtitle: '3-Month Analytics',
    url: import.meta.env.VITE_DASHBOARD_3MONTH_URL || 'http://localhost:3001',
    color: '#2563eb',
  },
]

function useServerStatus(url) {
  const [status, setStatus] = useState('checking')

  useEffect(() => {
    let cancelled = false
    const check = () => {
      fetch(`${url}/health`, { mode: 'no-cors' })
        .then(() => { if (!cancelled) setStatus('online') })
        .catch(() => { if (!cancelled) setStatus('offline') })
    }
    check()
    const interval = setInterval(check, 4000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [url])

  return status
}

function ProjectCard({ project, onClick, isDark }) {
  const status = useServerStatus(project.url)

  const dot = {
    online: '#22c55e',
    offline: '#ef4444',
    checking: '#f59e0b',
  }[status]

  const cardBg = isDark ? '#1e293b' : '#ffffff'
  const cardBorder = status === 'online'
    ? project.color
    : isDark ? 'rgba(51,65,85,0.6)' : '#e5e7eb'
  const cardShadow = isDark ? '0 2px 12px rgba(0,0,0,0.3)' : '0 2px 8px rgba(0,0,0,0.08)'
  const cardShadowHover = isDark ? '0 8px 28px rgba(0,0,0,0.5)' : '0 8px 24px rgba(0,0,0,0.12)'
  const titleColor = isDark ? '#f1f5f9' : '#111827'
  const subtitleColor = isDark ? '#94a3b8' : '#4b5563'
  const statusColor = isDark ? '#94a3b8' : '#374151'

  return (
    <div
      onClick={() => status === 'online' && onClick(project)}
      style={{
        background: cardBg,
        border: `1.5px solid ${cardBorder}`,
        borderRadius: 14,
        padding: '28px 32px',
        cursor: status === 'online' ? 'pointer' : 'default',
        transition: 'all 0.2s ease',
        boxShadow: cardShadow,
        opacity: status === 'offline' ? 0.55 : 1,
        minWidth: 260,
        maxWidth: 320,
        flex: '1 1 260px',
      }}
      onMouseEnter={e => {
        if (status === 'online') {
          e.currentTarget.style.boxShadow = cardShadowHover
          e.currentTarget.style.transform = 'translateY(-2px)'
        }
      }}
      onMouseLeave={e => {
        e.currentTarget.style.boxShadow = cardShadow
        e.currentTarget.style.transform = 'translateY(0)'
      }}
    >
      {/* Accent bar */}
      <div style={{ height: 4, borderRadius: 3, background: project.color, marginBottom: 20 }} />

      <h3 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 700, color: titleColor }}>
        {project.name}
      </h3>
      <p style={{ margin: '0 0 20px', fontSize: 14, color: subtitleColor }}>{project.subtitle}</p>

      {/* Status badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <span style={{
          width: 9, height: 9, borderRadius: '50%', background: dot,
          boxShadow: status === 'online' ? `0 0 6px ${dot}` : 'none',
          display: 'inline-block',
        }} />
        <span style={{ fontSize: 13, color: statusColor, fontWeight: 500 }}>
          {status === 'online' ? 'Online' : status === 'checking' ? 'Connecting\u2026' : 'Offline'}
        </span>
      </div>


      {status === 'online' && (
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          color: project.color, fontSize: 13, fontWeight: 600,
        }}>
          Open Dashboard
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="5" y1="12" x2="19" y2="12" />
            <polyline points="12 5 19 12 12 19" />
          </svg>
        </div>
      )}
    </div>
  )
}

export default function DashboardPage() {
  const { isDark } = useOutletContext()
  const [active, setActive] = useState(null)

  const pageBg = isDark ? '#0f172a' : '#ffffff'
  const titleColor = isDark ? '#f1f5f9' : '#111827'
  const descColor = isDark ? '#94a3b8' : '#4b5563'

  if (active) {
    return (
      <div style={{ width: '100%', height: 'calc(100vh - 70px)', position: 'relative' }}>
        {/* Back button */}
        <button
          onClick={() => setActive(null)}
          style={{
            position: 'absolute', top: 12, left: 12, zIndex: 10,
            display: 'flex', alignItems: 'center', gap: 6,
            background: isDark ? 'rgba(15,23,42,0.92)' : 'rgba(255,255,255,0.92)',
            border: `1px solid ${isDark ? '#334155' : '#e5e7eb'}`,
            borderRadius: 8, padding: '7px 14px',
            fontSize: 13, fontWeight: 600, color: titleColor,
            cursor: 'pointer',
            boxShadow: isDark ? '0 2px 8px rgba(0,0,0,0.4)' : '0 2px 8px rgba(0,0,0,0.1)',
            backdropFilter: 'blur(4px)',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
          All Projects
        </button>

        <iframe
          src={active.url}
          title={`${active.name} \u2013 ${active.subtitle}`}
          style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
        />
      </div>
    )
  }

  return (
    <div style={{
      width: '100%', minHeight: 'calc(100vh - 70px)',
      background: pageBg, padding: '48px 40px',
      boxSizing: 'border-box',
      transition: 'background 0.3s ease',
    }}>
      <h2 style={{ margin: '0 0 6px', fontSize: 24, fontWeight: 700, color: titleColor }}>
        Dashboard Projects
      </h2>
      <p style={{ margin: '0 0 36px', fontSize: 15, color: descColor }}>
        Select a project to open its analytics dashboard.
      </p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24 }}>
        {PROJECTS.map(p => (
          <ProjectCard key={p.id} project={p} onClick={setActive} isDark={isDark} />
        ))}
      </div>
    </div>
  )
}
