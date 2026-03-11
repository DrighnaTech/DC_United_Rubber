import { useState, useEffect } from 'react'

const PROJECTS = [
  {
    id: 'standard',
    name: 'United Rubber',
    subtitle: 'Sales Analytics',
    url: 'http://localhost:3000',
    dir: 'C:/Users/SamirSethi/Downloads/Python_extractor_dashboard/United_Rubber_html',
    color: '#f07b1c',
  },
  {
    id: '3month',
    name: 'United Rubber',
    subtitle: '3-Month Analytics',
    url: 'http://localhost:3001',
    dir: 'C:/Users/SamirSethi/Downloads/Python_extractor_dashboard/United_Rubber_html_3MONTH/United_Rubber_html',
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

function ProjectCard({ project, onClick }) {
  const status = useServerStatus(project.url)

  const dot = {
    online: '#22c55e',
    offline: '#ef4444',
    checking: '#f59e0b',
  }[status]

  return (
    <div
      onClick={() => status === 'online' && onClick(project)}
      style={{
        background: '#fff',
        border: `1.5px solid ${status === 'online' ? project.color : 'rgba(226,232,240,0.6)'}`,
        borderRadius: 14,
        padding: '28px 32px',
        cursor: status === 'online' ? 'pointer' : 'default',
        transition: 'box-shadow 0.2s, transform 0.15s',
        boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
        opacity: status === 'offline' ? 0.55 : 1,
        minWidth: 260,
        maxWidth: 320,
        flex: '1 1 260px',
      }}
      onMouseEnter={e => {
        if (status === 'online') {
          e.currentTarget.style.boxShadow = '0 8px 28px rgba(0,0,0,0.13)'
          e.currentTarget.style.transform = 'translateY(-2px)'
        }
      }}
      onMouseLeave={e => {
        e.currentTarget.style.boxShadow = '0 2px 12px rgba(0,0,0,0.06)'
        e.currentTarget.style.transform = 'translateY(0)'
      }}
    >
      {/* Accent bar */}
      <div style={{ height: 4, borderRadius: 3, background: project.color, marginBottom: 20 }} />

      <h3 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 700, color: '#1e293b' }}>
        {project.name}
      </h3>
      <p style={{ margin: '0 0 20px', fontSize: 14, color: '#64748b' }}>{project.subtitle}</p>

      {/* Status badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <span style={{
          width: 9, height: 9, borderRadius: '50%', background: dot,
          boxShadow: status === 'online' ? `0 0 6px ${dot}` : 'none',
          display: 'inline-block',
        }} />
        <span style={{ fontSize: 13, color: '#475569', fontWeight: 500 }}>
          {status === 'online' ? 'Online' : status === 'checking' ? 'Connecting…' : 'Offline'}
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
  const [active, setActive] = useState(null)

  if (active) {
    return (
      <div style={{ width: '100%', height: 'calc(100vh - 70px)', position: 'relative' }}>
        {/* Back button */}
        <button
          onClick={() => setActive(null)}
          style={{
            position: 'absolute', top: 12, left: 12, zIndex: 10,
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'rgba(255,255,255,0.92)', border: '1px solid #e5e7eb',
            borderRadius: 8, padding: '7px 14px',
            fontSize: 13, fontWeight: 600, color: '#1e293b',
            cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
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
          title={`${active.name} – ${active.subtitle}`}
          style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
        />
      </div>
    )
  }

  return (
    <div style={{
      width: '100%', minHeight: 'calc(100vh - 70px)',
      background: '#f8fafc', padding: '48px 40px',
      boxSizing: 'border-box',
    }}>
      <h2 style={{ margin: '0 0 6px', fontSize: 24, fontWeight: 700, color: '#1e293b' }}>
        Dashboard Projects
      </h2>
      <p style={{ margin: '0 0 36px', fontSize: 15, color: '#64748b' }}>
        Select a project to open its analytics dashboard.
      </p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24 }}>
        {PROJECTS.map(p => (
          <ProjectCard key={p.id} project={p} onClick={setActive} />
        ))}
      </div>
    </div>
  )
}
