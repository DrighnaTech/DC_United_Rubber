import { Routes, Route, Navigate } from 'react-router-dom'
import AppLayout from './pages/AppLayout'
import DashboardPage from './pages/DashboardPage'
import ExtractorPage from './pages/ExtractorPage'
import LoginPage from './pages/LoginPage'
import LandingPage from './pages/LandingPage'

function RequireAuth({ children }) {
  const auth = sessionStorage.getItem('dc_auth')
  if (!auth) return <Navigate to="/login" replace />
  return children
}

export default function App() {
  return (
    <Routes>
      {/* Public: Landing page */}
      <Route path="/" element={<LandingPage />} />

      {/* Public: Login page */}
      <Route path="/login" element={<LoginPage />} />

      {/* Protected: App layout with Dashboard + AI Data Extractor */}
      <Route
        path="/app"
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route index element={<Navigate to="/app/extractor" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="extractor" element={<ExtractorPage />} />
      </Route>

      {/* Redirect old routes to new paths */}
      <Route path="/extractor" element={<Navigate to="/app/extractor" replace />} />
      <Route path="/dashboard" element={<Navigate to="/app/dashboard" replace />} />
    </Routes>
  )
}
