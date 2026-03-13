import React, { useState, useRef } from 'react'
import axios from 'axios'
import { DOC_TYPES, UPLOAD_METHODS, API_BASE } from '../utils/constants'
import Icon from './Icons'

// Sales Order module uses a separate API prefix (routed to the same backend)
const SALES_API = '/api/v1'

/**
 * Multi-step wizard modal for document extraction
 * Flow:
 *   Step 0: Select document type (Sales Order / Costing Diagram / ECI)
 *   Step 1: (Sales Order only) Select method (Email / Direct Upload)
 *   Step 2: Configure - Email form OR File uploader
 *   Step 3: Extracting (loading) → Results
 */
export default function WizardModal({ open, onClose }) {
  const [step, setStep] = useState(0)
  const [docType, setDocType] = useState(null)
  const [subOption, setSubOption] = useState(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [uploadedFile, setUploadedFile] = useState(null)
  const [connecting, setConnecting] = useState(false)
  const [connected, setConnected] = useState(false)
  const [connectError, setConnectError] = useState(null)
  const [extracting, setExtracting] = useState(false)
  const [extractResult, setExtractResult] = useState(null)
  const [extractError, setExtractError] = useState(null)
  const [showJson, setShowJson] = useState(true)
  const [downloading, setDownloading] = useState(false)
  const fileRef = useRef(null)

  // ── Helpers ──
  const reset = () => {
    setStep(0)
    setDocType(null)
    setSubOption(null)
    setEmail('')
    setPassword('')
    setShowPassword(false)
    setUploadedFile(null)
    setConnecting(false)
    setConnected(false)
    setConnectError(null)
    setExtracting(false)
    setExtractResult(null)
    setExtractError(null)
    setShowJson(true)
    setDownloading(false)
  }

  const handleClose = () => { reset(); onClose() }

  const handleContinue = () => {
    if (step === 0 && docType) {
      if (docType === 'sales') { setStep(1) }
      else { setStep(2); setSubOption('upload') }
    } else if (step === 1 && subOption) {
      setStep(2)
    }
  }

  const handleBack = () => {
    if (step === 2) {
      if (docType === 'sales') { setStep(1); setSubOption(null) }
      else { setStep(0); setDocType(null) }
    } else if (step === 1) { setStep(0); setDocType(null); setSubOption(null) }
  }

  const handleFileDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    if (e.dataTransfer.files[0]) setUploadedFile(e.dataTransfer.files[0])
  }

  const handleFileSelect = (e) => {
    if (e.target.files[0]) setUploadedFile(e.target.files[0])
  }

  const handleConnect = async () => {
    setConnecting(true)
    setConnectError(null)
    try {
      const formData = new FormData()
      formData.append('email_address', email)
      formData.append('email_password', password)
      const res = await axios.post(`${SALES_API}/verify-email`, formData, {
        timeout: 30000,
      })
      if (res.data.status) {
        setConnected(true)
      } else {
        setConnectError(res.data.response || 'Connection failed')
      }
    } catch (err) {
      setConnectError(err.response?.data?.detail || err.message || 'Connection failed')
    } finally {
      setConnecting(false)
    }
  }

  // ── Sales Order: Email-based extraction ──
  const handleEmailExtract = async () => {
    setExtracting(true)
    setExtractError(null)
    setExtractResult(null)
    setStep(3)
    try {
      const formData = new FormData()
      formData.append('email_address', email)
      formData.append('email_password', password)
      const res = await axios.post(`${SALES_API}/extract`, formData, {
        timeout: 600000, // 10 min — email scanning can be slow
      })
      if (import.meta.env.DEV) console.log('[Sales Order Email] API response:', JSON.stringify(res.data, null, 2))
      if (res.data.status) {
        setExtractResult({ ...res.data, _isSalesOrder: true })
      } else {
        setExtractError(res.data.response || 'Extraction failed')
      }
    } catch (err) {
      console.error('[Sales Order Email] Error:', err)
      setExtractError(err.response?.data?.detail || err.message || 'Extraction failed')
    } finally {
      setExtracting(false)
    }
  }

  // ── File upload extraction (branches by docType) ──
  const handleExtract = async () => {
    if (!uploadedFile) return
    setExtracting(true)
    setExtractError(null)
    setExtractResult(null)
    setStep(3)

    try {
      if (docType === 'sales') {
        // Sales Order → new backend endpoint
        const formData = new FormData()
        formData.append('files', uploadedFile)
        const res = await axios.post(`${SALES_API}/extract/upload`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
          timeout: 600000,
        })
        if (import.meta.env.DEV) console.log('[Sales Order Upload] API response:', JSON.stringify(res.data, null, 2))
        if (res.data.status) {
          setExtractResult({ ...res.data, _isSalesOrder: true })
        } else {
          setExtractError(res.data.response || 'Extraction failed')
        }
      } else {
        // Costing Diagram / ECI → existing backend endpoint
        const formData = new FormData()
        formData.append('file', uploadedFile)
        formData.append('model', 'gpt-4o-mini')
        formData.append('max_tokens', '16384')
        const res = await axios.post(`${API_BASE}/extract`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
          timeout: 300000,
        })
        setExtractResult(res.data)
      }
    } catch (err) {
      const msg = err.response?.data?.detail || err.message || 'Extraction failed'
      setExtractError(msg)
    } finally {
      setExtracting(false)
    }
  }

  // ── Download Excel (branches by docType) ──
  const handleDownloadExcel = async () => {
    setDownloading(true)
    const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    try {
      let blob, fileName
      if (docType === 'sales') {
        // Sales Order → download pre-generated Excel from backend
        const res = await axios.get(`${SALES_API}/download/excel`, {
          responseType: 'blob',
          timeout: 60000,
        })
        // Backend may return JSON error instead of a file
        if (res.data.type === 'application/json') {
          const text = await res.data.text()
          const json = JSON.parse(text)
          throw new Error(json.response || json.detail || 'No Excel file available. Run extraction first.')
        }
        blob = new Blob([res.data], { type: XLSX_MIME })
        fileName = 'sales_order_data.xlsx'
      } else {
        // Costing → build Excel from already-extracted data (no re-extraction)
        if (!extractResult?.data) {
          setExtractError('No extraction data available for Excel download')
          setDownloading(false)
          return
        }
        const res = await axios.post(`${API_BASE}/build-excel`, {
          data: extractResult.data,
          file_name: extractResult.file_name || 'extraction',
        }, {
          responseType: 'blob',
          timeout: 60000,
        })
        blob = new Blob([res.data], { type: XLSX_MIME })
        const baseName = (extractResult.file_name || 'extraction').replace(/\.[^.]+$/, '')
        fileName = `${baseName}_DATA_POINTS.xlsx`
      }
      // Trigger browser download
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', fileName)
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch (err) {
      let msg = 'Download failed'
      if (err.response?.data instanceof Blob) {
        try {
          const text = await err.response.data.text()
          const json = JSON.parse(text)
          msg = json.detail || json.response || msg
        } catch { /* blob wasn't JSON */ }
      } else {
        msg = err.response?.data?.detail || err.message || msg
      }
      setExtractError(msg)
    } finally {
      setDownloading(false)
    }
  }

  // ── Download JSON ──
  const handleDownloadJson = () => {
    const jsonData = extractResult?._isSalesOrder ? extractResult.data : extractResult
    const blob = new Blob([JSON.stringify(jsonData, null, 2)], { type: 'application/json' })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    const baseName = (extractResult?.file_name || 'extraction').replace(/\.[^.]+$/, '')
    link.setAttribute('download', `${baseName}_extracted.json`)
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.URL.revokeObjectURL(url)
  }

  if (!open) return null

  // Progress bar labels
  const stepLabels = docType === 'sales'
    ? ['Document Type', 'Upload Method', 'Configure']
    : ['Document Type', 'Configure']
  const currentStepIndex = docType === 'sales' ? step : (step === 0 ? 0 : 1)

  const canContinue = (step === 0 && docType) || (step === 1 && subOption)
  const isResults = !!(extractResult && !extracting && !extractError)

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'flex',
        alignItems: isResults ? 'stretch' : 'center',
        justifyContent: isResults ? 'stretch' : 'center',
        animation: 'modalBgIn 0.3s ease-out',
      }}
      onClick={handleClose}
    >
      {/* Backdrop */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.45)',
          backdropFilter: 'blur(8px)',
        }}
      />

      {/* Modal Container */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'relative',
          width: isResults ? '100vw' : 'min(94vw, 740px)',
          height: isResults ? '100vh' : 'auto',
          background: '#ffffff',
          borderRadius: isResults ? 0 : 24,
          border: '1px solid #e2e8f0',
          boxShadow: isResults ? 'none' : '0 25px 60px rgba(0, 0, 0, 0.15), 0 0 40px rgba(139, 92, 246, 0.06)',
          overflow: isResults ? 'auto' : 'hidden',
          animation: 'modalIn 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
          display: isResults ? 'flex' : 'block',
          flexDirection: isResults ? 'column' : undefined,
        }}
      >
        {/* Top gradient accent bar */}
        <div
          style={{
            height: 4,
            background: 'linear-gradient(90deg, #1A5EA8, #3b82f6, #F07621, #1A5EA8)',
            backgroundSize: '200% 100%',
            animation: 'waveMove 3s linear infinite',
          }}
        />

        {/* Close Button */}
        <button
          onClick={handleClose}
          style={{
            position: 'absolute',
            top: 18,
            right: 18,
            width: 36,
            height: 36,
            borderRadius: '50%',
            background: '#f1f5f9',
            border: '1px solid #e2e8f0',
            color: '#64748b',
            fontSize: 18,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.2s',
            zIndex: 10,
          }}
          onMouseEnter={(e) => {
            e.target.style.background = 'rgba(239, 68, 68, 0.1)'
            e.target.style.color = '#ef4444'
            e.target.style.borderColor = 'rgba(239, 68, 68, 0.3)'
          }}
          onMouseLeave={(e) => {
            e.target.style.background = '#f1f5f9'
            e.target.style.color = '#64748b'
            e.target.style.borderColor = '#e2e8f0'
          }}
        >
          ✕
        </button>

        <div style={{ padding: '32px 38px 30px' }}>
          {/* ── Progress Stepper ── */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 30 }}>
            {stepLabels.map((lbl, i) => (
              <React.Fragment key={i}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: '50%',
                      fontSize: 12,
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: currentStepIndex >= i
                        ? 'linear-gradient(135deg, #1A5EA8, #F07621)'
                        : '#f1f5f9',
                      color: currentStepIndex >= i ? '#fff' : '#94a3b8',
                      border: currentStepIndex >= i ? 'none' : '1px solid #e2e8f0',
                      transition: 'all 0.4s ease',
                      boxShadow: currentStepIndex === i ? '0 0 14px rgba(168, 85, 247, 0.5)' : 'none',
                    }}
                  >
                    {currentStepIndex > i ? '✓' : i + 1}
                  </div>
                  <span
                    style={{
                      fontSize: 13,
                      color: currentStepIndex >= i ? '#1e293b' : '#94a3b8',
                      fontWeight: 500,
                    }}
                  >
                    {lbl}
                  </span>
                </div>
                {i < stepLabels.length - 1 && (
                  <div
                    style={{
                      width: 44,
                      height: 2,
                      background: currentStepIndex > i ? '#1A5EA8' : '#e2e8f0',
                      borderRadius: 1,
                      transition: 'background 0.4s',
                    }}
                  />
                )}
              </React.Fragment>
            ))}
          </div>

          {/* ═══════════════ STEP 0: Document Type ═══════════════ */}
          {step === 0 && (
            <div style={{ animation: 'slideIn 0.35s ease-out' }}>
              <h2
                style={{
                  fontFamily: "'Playfair Display', serif",
                  fontSize: 28,
                  fontWeight: 800,
                  color: '#1e293b',
                  margin: '0 0 6px',
                }}
              >
                What would you like to process?
              </h2>
              <p style={{ color: '#64748b', fontSize: 14, margin: '0 0 26px' }}>
                Select the type of document you want to extract data from
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16, maxWidth: 480, margin: '0 auto' }}>
                {DOC_TYPES.map((dt) => {
                  const sel = docType === dt.id
                  return (
                    <div
                      key={dt.id}
                      onClick={() => setDocType(dt.id)}
                      style={{
                        padding: '30px 18px',
                        borderRadius: 18,
                        background: sel ? 'rgba(139, 92, 246, 0.08)' : '#f8fafc',
                        border: `2px solid ${sel ? '#1A5EA8' : '#e2e8f0'}`,
                        cursor: 'pointer',
                        textAlign: 'center',
                        transition: 'all 0.3s ease',
                        transform: sel ? 'translateY(-3px)' : 'none',
                        boxShadow: sel ? '0 10px 35px rgba(124, 58, 237, 0.15)' : '0 1px 3px rgba(0,0,0,0.05)',
                        position: 'relative',
                        overflow: 'hidden',
                      }}
                      onMouseEnter={(e) => {
                        if (!sel) {
                          e.currentTarget.style.borderColor = 'rgba(139, 92, 246, 0.4)'
                          e.currentTarget.style.background = '#f1f5f9'
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!sel) {
                          e.currentTarget.style.borderColor = '#e2e8f0'
                          e.currentTarget.style.background = '#f8fafc'
                        }
                      }}
                    >
                      {/* Gradient glow on selection */}
                      {sel && (
                        <div
                          style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            right: 0,
                            height: 3,
                            background: dt.gradient,
                            borderRadius: '0 0 3px 3px',
                          }}
                        />
                      )}

                      <div
                        style={{
                          marginBottom: 16,
                          transition: 'transform 0.3s',
                          transform: sel ? 'scale(1.15)' : 'scale(1)',
                        }}
                      >
                        <Icon name={dt.icon} size={40} color={sel ? '#6366f1' : '#64748b'} />
                      </div>
                      <div style={{ fontWeight: 700, color: '#1e293b', fontSize: 17, marginBottom: 8 }}>
                        {dt.title}
                      </div>
                      <div style={{ color: '#64748b', fontSize: 12, lineHeight: 1.55 }}>
                        {dt.desc}
                      </div>

                      {sel && (
                        <div
                          style={{
                            marginTop: 14,
                            width: 26,
                            height: 26,
                            borderRadius: '50%',
                            background: 'linear-gradient(135deg, #1A5EA8, #F07621)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            margin: '14px auto 0',
                            fontSize: 14,
                            color: '#fff',
                            animation: 'scaleIn 0.3s ease-out',
                          }}
                        >
                          ✓
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* ═══════════════ STEP 1: Upload Method (Sales Order) ═══════════════ */}
          {step === 1 && (
            <div style={{ animation: 'slideIn 0.35s ease-out' }}>
              <h2
                style={{
                  fontFamily: "'Playfair Display', serif",
                  fontSize: 28,
                  fontWeight: 800,
                  color: '#1e293b',
                  margin: '0 0 6px',
                }}
              >
                How would you like to upload?
              </h2>
              <p style={{ color: '#64748b', fontSize: 14, margin: '0 0 26px' }}>
                Choose your preferred method for sales order extraction
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
                {UPLOAD_METHODS.map((opt) => {
                  const sel = subOption === opt.id
                  return (
                    <div
                      key={opt.id}
                      onClick={() => setSubOption(opt.id)}
                      style={{
                        padding: '36px 24px',
                        borderRadius: 18,
                        background: sel ? 'rgba(139, 92, 246, 0.08)' : '#f8fafc',
                        border: `2px solid ${sel ? '#1A5EA8' : '#e2e8f0'}`,
                        cursor: 'pointer',
                        textAlign: 'center',
                        transition: 'all 0.3s ease',
                        transform: sel ? 'translateY(-3px)' : 'none',
                        boxShadow: sel ? '0 10px 35px rgba(124, 58, 237, 0.15)' : '0 1px 3px rgba(0,0,0,0.05)',
                        position: 'relative',
                        overflow: 'hidden',
                      }}
                      onMouseEnter={(e) => {
                        if (!sel) {
                          e.currentTarget.style.borderColor = 'rgba(139, 92, 246, 0.4)'
                          e.currentTarget.style.background = '#f1f5f9'
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!sel) {
                          e.currentTarget.style.borderColor = '#e2e8f0'
                          e.currentTarget.style.background = '#f8fafc'
                        }
                      }}
                    >
                      {sel && (
                        <div
                          style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            right: 0,
                            height: 3,
                            background: opt.gradient,
                          }}
                        />
                      )}

                      <div
                        style={{
                          marginBottom: 18,
                          transition: 'transform 0.3s',
                          transform: sel ? 'scale(1.15)' : 'scale(1)',
                        }}
                      >
                        <Icon name={opt.icon} size={48} color={sel ? '#1A5EA8' : '#64748b'} />
                      </div>
                      <div style={{ fontWeight: 700, color: '#1e293b', fontSize: 19, marginBottom: 10 }}>
                        {opt.title}
                      </div>
                      <div style={{ color: '#64748b', fontSize: 13, lineHeight: 1.55 }}>
                        {opt.desc}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* ═══════════════ STEP 2: Form / Upload ═══════════════ */}
          {step === 2 && (
            <div style={{ animation: 'slideIn 0.35s ease-out' }}>
              {/* ── EMAIL FORM ── */}
              {subOption === 'email' ? (
                <>
                  <h2
                    style={{
                      fontFamily: "'Playfair Display', serif",
                      fontSize: 28,
                      fontWeight: 800,
                      color: '#1e293b',
                      margin: '0 0 6px',
                    }}
                  >
                    Connect Your Email
                  </h2>
                  <p style={{ color: '#64748b', fontSize: 14, margin: '0 0 30px' }}>
                    Enter your email credentials to start auto-extraction
                  </p>

                  <div style={{ maxWidth: 460 }}>
                    {/* Email Input */}
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#475569', marginBottom: 8 }}>
                      Email Address
                    </label>
                    <div style={{ position: 'relative', marginBottom: 22 }}>
                      <span style={{ position: 'absolute', left: 15, top: '50%', transform: 'translateY(-50%)', fontSize: 18 }}>
                        <Icon name="mail" size={18} color="#1A5EA8" />
                      </span>
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="your@email.com"
                        style={{
                          width: '100%',
                          padding: '15px 16px 15px 46px',
                          borderRadius: 12,
                          border: '1px solid #e2e8f0',
                          background: '#f8fafc',
                          color: '#1e293b',
                          fontSize: 15,
                          outline: 'none',
                          transition: 'border-color 0.3s, box-shadow 0.3s',
                          boxSizing: 'border-box',
                        }}
                        onFocus={(e) => {
                          e.target.style.borderColor = '#1A5EA8'
                          e.target.style.boxShadow = '0 0 12px rgba(124, 58, 237, 0.12)'
                        }}
                        onBlur={(e) => {
                          e.target.style.borderColor = '#e2e8f0'
                          e.target.style.boxShadow = 'none'
                        }}
                      />
                    </div>

                    {/* Password Input */}
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#475569', marginBottom: 8 }}>
                      Password
                    </label>
                    <div style={{ position: 'relative', marginBottom: 30 }}>
                      <span style={{ position: 'absolute', left: 15, top: '50%', transform: 'translateY(-50%)', fontSize: 18 }}>
                        <Icon name="lock" size={18} color="#64748b" />
                      </span>
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        style={{
                          width: '100%',
                          padding: '15px 50px 15px 46px',
                          borderRadius: 12,
                          border: '1px solid #e2e8f0',
                          background: '#f8fafc',
                          color: '#1e293b',
                          fontSize: 15,
                          outline: 'none',
                          transition: 'border-color 0.3s, box-shadow 0.3s',
                          boxSizing: 'border-box',
                        }}
                        onFocus={(e) => {
                          e.target.style.borderColor = '#1A5EA8'
                          e.target.style.boxShadow = '0 0 12px rgba(124, 58, 237, 0.12)'
                        }}
                        onBlur={(e) => {
                          e.target.style.borderColor = '#e2e8f0'
                          e.target.style.boxShadow = 'none'
                        }}
                      />
                      {/* Toggle visibility */}
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        style={{
                          position: 'absolute',
                          right: 14,
                          top: '50%',
                          transform: 'translateY(-50%)',
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          fontSize: 16,
                          color: '#64748b',
                          padding: 4,
                        }}
                      >
                        {showPassword ? (
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                            <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                            <line x1="1" y1="1" x2="23" y2="23" />
                          </svg>
                        ) : (
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                            <circle cx="12" cy="12" r="3" />
                          </svg>
                        )}
                      </button>
                    </div>

                    {/* Connect Button */}
                    <button
                      onClick={handleConnect}
                      disabled={!email || !password || connecting || connected}
                      style={{
                        width: '100%',
                        padding: '16px 24px',
                        borderRadius: 12,
                        border: 'none',
                        background: connected
                          ? 'linear-gradient(135deg, #10b981, #059669)'
                          : (email && password && !connecting)
                            ? 'linear-gradient(135deg, #1A5EA8, #1552A0)'
                            : '#f1f5f9',
                        color: (email && password) || connected ? '#fff' : '#94a3b8',
                        fontSize: 15,
                        fontWeight: 700,
                        cursor: (email && password && !connecting && !connected) ? 'pointer' : 'not-allowed',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 10,
                        transition: 'all 0.3s',
                        boxShadow: connected
                          ? '0 8px 24px rgba(16, 185, 129, 0.3)'
                          : (email && password)
                            ? '0 8px 28px rgba(124, 58, 237, 0.3)'
                            : 'none',
                      }}
                    >
                      {connected ? (
                        <>
                          <span style={{ fontSize: 18 }}>✅</span>
                          Connected Successfully!
                        </>
                      ) : connecting ? (
                        <>
                          <span style={{ animation: 'spin 1s linear infinite', display: 'inline-flex' }}><Icon name="zap" size={16} color="#fff" /></span>
                          Connecting...
                        </>
                      ) : (
                        <><Icon name="link" size={16} color="#fff" style={{ marginRight: 6 }} /> Connect Email</>
                      )}
                    </button>

                    {/* Connection Error */}
                    {connectError && (
                      <div
                        style={{
                          marginTop: 12,
                          padding: '12px 16px',
                          borderRadius: 10,
                          background: 'rgba(239, 68, 68, 0.1)',
                          border: '1px solid rgba(239, 68, 68, 0.3)',
                          color: '#f87171',
                          fontSize: 13,
                          textAlign: 'center',
                        }}
                      >
                        {connectError}
                      </div>
                    )}

                    {/* Start Extraction Button */}
                    {connected && (
                      <button
                        onClick={handleEmailExtract}
                        style={{
                          marginTop: 16,
                          width: '100%',
                          padding: '16px 24px',
                          borderRadius: 12,
                          border: 'none',
                          background: 'linear-gradient(135deg, #1A5EA8, #1552A0)',
                          color: '#fff',
                          fontSize: 15,
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 10,
                          boxShadow: '0 8px 28px rgba(124, 58, 237, 0.3)',
                          animation: 'slideUp 0.3s ease-out',
                          transition: 'transform 0.2s, box-shadow 0.2s',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.transform = 'translateY(-2px)'
                          e.currentTarget.style.boxShadow = '0 12px 36px rgba(124, 58, 237, 0.4)'
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.transform = 'translateY(0)'
                          e.currentTarget.style.boxShadow = '0 8px 28px rgba(124, 58, 237, 0.3)'
                        }}
                      >
                        🚀 Start Extraction
                      </button>
                    )}
                  </div>
                </>
              ) : (
                /* ── FILE UPLOAD ── */
                <>
                  <h2
                    style={{
                      fontFamily: "'Playfair Display', serif",
                      fontSize: 28,
                      fontWeight: 800,
                      color: '#1e293b',
                      margin: '0 0 6px',
                    }}
                  >
                    Upload Your{' '}
                    {docType === 'sales' ? 'Sales Order' : docType === 'costing' ? 'Costing Diagram' : 'ECI Document'}
                  </h2>
                  <p style={{ color: '#64748b', fontSize: 14, margin: '0 0 28px' }}>
                    Drag & drop or click to select your file
                  </p>

                  {/* Drop Zone */}
                  <div
                    onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={handleFileDrop}
                    onClick={() => fileRef.current?.click()}
                    style={{
                      padding: uploadedFile ? '28px' : '56px 28px',
                      borderRadius: 18,
                      border: `2px dashed ${
                        dragOver ? '#1A5EA8'
                          : uploadedFile ? '#10b981'
                            : 'rgba(139, 92, 246, 0.25)'
                      }`,
                      background: dragOver
                        ? 'rgba(139, 92, 246, 0.06)'
                        : uploadedFile
                          ? 'rgba(16, 185, 129, 0.04)'
                          : '#f8fafc',
                      textAlign: 'center',
                      cursor: 'pointer',
                      transition: 'all 0.3s ease',
                    }}
                  >
                    <input
                      type="file"
                      ref={fileRef}
                      accept=".pdf,.png,.jpg,.jpeg,.tiff,.tif"
                      onChange={handleFileSelect}
                      style={{ display: 'none' }}
                    />

                    {uploadedFile ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                        <div
                          style={{
                            width: 56,
                            height: 56,
                            borderRadius: 14,
                            background: 'rgba(16, 185, 129, 0.12)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 26,
                            flexShrink: 0,
                          }}
                        >
                          <Icon name="file-text" size={20} color="#64748b" />
                        </div>
                        <div style={{ textAlign: 'left', flex: 1, minWidth: 0 }}>
                          <div
                            style={{
                              color: '#1e293b',
                              fontWeight: 600,
                              fontSize: 15,
                              marginBottom: 3,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {uploadedFile.name}
                          </div>
                          <div style={{ color: '#64748b', fontSize: 12 }}>
                            {(uploadedFile.size / 1024).toFixed(1)} KB •{' '}
                            {uploadedFile.type || 'document'}
                          </div>
                        </div>
                        <div
                          style={{
                            width: 34,
                            height: 34,
                            borderRadius: '50%',
                            background: 'rgba(16, 185, 129, 0.18)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#10b981',
                            fontSize: 16,
                            flexShrink: 0,
                            animation: 'scaleIn 0.3s ease-out',
                          }}
                        >
                          ✓
                        </div>
                      </div>
                    ) : (
                      <>
                        <div style={{ fontSize: 52, marginBottom: 16, animation: 'bounce 2.5s ease-in-out infinite' }}>
                          📁
                        </div>
                        <div style={{ color: '#1e293b', fontWeight: 600, fontSize: 17, marginBottom: 8 }}>
                          Drop your file here
                        </div>
                        <div style={{ color: '#64748b', fontSize: 13 }}>
                          or click to browse • PDF, PNG, JPG, TIFF
                        </div>
                      </>
                    )}
                  </div>

                  {/* Extract Button */}
                  {uploadedFile && (
                    <button
                      onClick={handleExtract}
                      style={{
                        marginTop: 22,
                        width: '100%',
                        padding: '16px 24px',
                        borderRadius: 12,
                        border: 'none',
                        background: 'linear-gradient(135deg, #1A5EA8, #1552A0)',
                        color: '#fff',
                        fontSize: 15,
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 10,
                        boxShadow: '0 8px 28px rgba(124, 58, 237, 0.3)',
                        animation: 'slideUp 0.3s ease-out',
                        transition: 'transform 0.2s, box-shadow 0.2s',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'translateY(-2px)'
                        e.currentTarget.style.boxShadow = '0 12px 36px rgba(124, 58, 237, 0.4)'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'translateY(0)'
                        e.currentTarget.style.boxShadow = '0 8px 28px rgba(124, 58, 237, 0.3)'
                      }}
                    >
                      🚀 Start Extraction
                    </button>
                  )}
                </>
              )}
            </div>
          )}

          {/* ═══════════════ STEP 3: Extracting / Results ═══════════════ */}
          {step === 3 && (
            <div style={{
              animation: 'slideIn 0.35s ease-out',
              textAlign: 'center',
              flex: isResults ? 1 : undefined,
              overflowY: isResults ? 'auto' : undefined,
              padding: isResults ? '32px 40px' : undefined,
            }}>
              {extracting && (
                <>
                  <div style={{ fontSize: 64, marginBottom: 20, animation: 'pulse 1.5s ease-in-out infinite' }}>
                    <Icon name="brain" size={24} color="#6366f1" />
                  </div>
                  <h2
                    style={{
                      fontFamily: "'Playfair Display', serif",
                      fontSize: 26,
                      fontWeight: 800,
                      color: '#000',
                      margin: '0 0 10px',
                    }}
                  >
                    AI is Extracting...
                  </h2>
                  <p style={{ color: '#64748b', fontSize: 14, marginBottom: 28 }}>
                    Analyzing your {docType === 'costing' ? 'Costing Diagram' : docType === 'sales' ? 'Sales Order' : 'ECI Document'}.
                    This may take 30–90 seconds.
                  </p>
                  <div
                    style={{
                      width: '80%',
                      height: 6,
                      borderRadius: 3,
                      background: '#e2e8f0',
                      margin: '0 auto',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        width: '60%',
                        height: '100%',
                        borderRadius: 3,
                        background: 'linear-gradient(90deg, #1A5EA8, #3b82f6, #F07621)',
                        backgroundSize: '200% 100%',
                        animation: 'waveMove 1.5s linear infinite',
                      }}
                    />
                  </div>
                </>
              )}

              {extractError && (
                <>
                  <div style={{ marginBottom: 18 }}><Icon name="alert-triangle" size={56} color="#ef4444" /></div>
                  <h2
                    style={{
                      fontFamily: "'Playfair Display', serif",
                      fontSize: 24,
                      fontWeight: 800,
                      color: '#f87171',
                      margin: '0 0 10px',
                    }}
                  >
                    Extraction Failed
                  </h2>
                  <p
                    style={{
                      color: '#64748b',
                      fontSize: 14,
                      marginBottom: 8,
                      maxWidth: 500,
                      margin: '0 auto 24px',
                      lineHeight: 1.6,
                    }}
                  >
                    {extractError}
                  </p>
                  <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                    <button
                      onClick={() => { setStep(2); setExtractError(null) }}
                      style={{
                        padding: '12px 28px',
                        borderRadius: 12,
                        background: '#f1f5f9',
                        border: '1px solid #e2e8f0',
                        color: '#475569',
                        fontSize: 14,
                        fontWeight: 600,
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                      }}
                    >
                      ← Go Back
                    </button>
                    <button
                      onClick={handleExtract}
                      style={{
                        padding: '12px 28px',
                        borderRadius: 12,
                        border: 'none',
                        background: 'linear-gradient(135deg, #1A5EA8, #1552A0)',
                        color: '#fff',
                        fontSize: 14,
                        fontWeight: 700,
                        cursor: 'pointer',
                        boxShadow: '0 4px 18px rgba(124, 58, 237, 0.3)',
                      }}
                    >
                      🔄 Retry
                    </button>
                  </div>
                </>
              )}

              {extractResult && !extracting && !extractError && (
                <>
                  <div style={{ fontSize: 56, marginBottom: 16, animation: 'scaleIn 0.4s ease-out' }}>
                    ✅
                  </div>
                  <h2
                    style={{
                      fontFamily: "'Playfair Display', serif",
                      fontSize: 26,
                      fontWeight: 800,
                      color: '#000',
                      margin: '0 0 8px',
                    }}
                  >
                    Extraction Complete!
                  </h2>

                  {/* ── Sales Order Results ── */}
                  {extractResult._isSalesOrder ? (() => {
                    const results = extractResult.data?.results || []
                    // Flatten all invoices from all results (email or upload)
                    const allInvoices = results.flatMap(r => r.invoices || [r])
                    const totalLineItems = allInvoices.reduce(
                      (sum, inv) => sum + (inv.line_items?.length || 0), 0
                    )
                    const totalPages = allInvoices.reduce(
                      (sum, inv) => sum + (inv.processing_summary?.total_pages_processed || 0), 0
                    )
                    const successPages = allInvoices.reduce(
                      (sum, inv) => sum + (inv.processing_summary?.successful_pages || 0), 0
                    )
                    // Collect all page errors across invoices
                    const allErrors = allInvoices.flatMap(inv =>
                      inv.processing_summary?.errors || []
                    )
                    const soAccuracy = totalPages > 0
                      ? Math.round((successPages / totalPages) * 100)
                      : null
                    return (
                      <>
                        <p style={{ color: '#000', fontSize: 14, marginBottom: 24 }}>
                          {allInvoices.length} file{allInvoices.length !== 1 ? 's' : ''} processed
                          {' '}— {totalPages} page{totalPages !== 1 ? 's' : ''} scanned
                        </p>

                        {/* Summary Cards */}
                        <div
                          style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(4, 1fr)',
                            gap: 12,
                            marginBottom: 24,
                            textAlign: 'center',
                          }}
                        >
                          {[
                            { label: 'Files Processed', value: allInvoices.length, icon: 'file-text' },
                            { label: 'Line Items', value: totalLineItems, icon: 'bar-chart' },
                            { label: 'Pages OK', value: `${successPages}/${totalPages}`, icon: successPages > 0 ? 'shield' : 'alert-triangle' },
                            { label: 'Accuracy', value: soAccuracy != null ? `${soAccuracy}%` : '—', icon: 'star' },
                          ].map((stat, i) => (
                            <div
                              key={i}
                              style={{
                                padding: '18px 12px',
                                borderRadius: 14,
                                background: '#f8fafc',
                                border: '1px solid #e2e8f0',
                              }}
                            >
                              <div style={{ marginBottom: 6 }}><Icon name={stat.icon} size={24} color="#6366f1" /></div>
                              <div style={{ fontWeight: 800, color: '#000', fontSize: 20, marginBottom: 2 }}>
                                {stat.value}
                              </div>
                              <div style={{ color: '#000', fontSize: 11, fontWeight: 500 }}>{stat.label}</div>
                            </div>
                          ))}
                        </div>

                        {/* ── Header Details (per invoice) ── */}
                        {allInvoices.map((inv, idx) => {
                          const hdr = inv.header
                          const addr = inv.addresses
                          const items = inv.line_items || []
                          return (
                            <div key={idx} style={{ textAlign: 'left', marginBottom: 16 }}>
                              {/* Invoice file title */}
                              <div style={{
                                fontSize: 13, fontWeight: 700, color: '#a78bfa', marginBottom: 10,
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                              }}>
                                <span>{inv.filename || `Invoice ${idx + 1}`}</span>
                                <span style={{ color: '#000', fontWeight: 500, fontSize: 11 }}>
                                  {items.length} line item{items.length !== 1 ? 's' : ''}
                                </span>
                              </div>

                              {/* Header fields */}
                              {hdr && Object.keys(hdr).length > 0 && (
                                <div style={{
                                  padding: '14px 16px', borderRadius: 12,
                                  background: '#f8fafc',
                                  border: '1px solid #e2e8f0',
                                  marginBottom: 12,
                                }}>
                                  <div style={{ fontSize: 11, fontWeight: 700, color: '#000', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>
                                    Header Details
                                  </div>
                                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px' }}>
                                    {Object.entries(hdr).filter(([, v]) => v != null && v !== '').map(([key, val]) => (
                                      <div key={key} style={{ fontSize: 12, padding: '2px 0' }}>
                                        <span style={{ color: '#000' }}>{key}: </span>
                                        <span style={{ color: '#000', fontWeight: 500 }}>{String(val)}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* Address info */}
                              {addr && Object.keys(addr).length > 0 && (
                                <div style={{
                                  padding: '10px 16px', borderRadius: 12,
                                  background: '#f8fafc',
                                  border: '1px solid #e2e8f0',
                                  marginBottom: 12,
                                }}>
                                  <div style={{ fontSize: 11, fontWeight: 700, color: '#000', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>
                                    Address
                                  </div>
                                  {Object.entries(addr).filter(([, v]) => v != null && v !== '').map(([key, val]) => (
                                    <div key={key} style={{ fontSize: 12, padding: '2px 0' }}>
                                      <span style={{ color: '#000' }}>{key}: </span>
                                      <span style={{ color: '#000', fontWeight: 500 }}>{String(val)}</span>
                                    </div>
                                  ))}
                                </div>
                              )}

                              {/* Line Items Table */}
                              {items.length > 0 && (
                                <div style={{
                                  borderRadius: 12,
                                  border: '1px solid #e2e8f0',
                                  overflow: 'hidden',
                                  marginBottom: 12,
                                }}>
                                  <div style={{ fontSize: 11, fontWeight: 700, color: '#000', padding: '10px 16px', textTransform: 'uppercase', letterSpacing: 1, background: '#f8fafc' }}>
                                    Line Items
                                  </div>
                                  <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                                      <thead>
                                        <tr style={{ background: 'rgba(139,92,246,0.06)' }}>
                                          <th style={{ padding: '8px 10px', textAlign: 'left', color: '#000', fontWeight: 600 }}>#</th>
                                          <th style={{ padding: '8px 10px', textAlign: 'left', color: '#000', fontWeight: 600 }}>Item Code</th>
                                          <th style={{ padding: '8px 10px', textAlign: 'right', color: '#000', fontWeight: 600 }}>Qty</th>
                                          <th style={{ padding: '8px 10px', textAlign: 'left', color: '#000', fontWeight: 600 }}>UOM</th>
                                          <th style={{ padding: '8px 10px', textAlign: 'right', color: '#000', fontWeight: 600 }}>Rate</th>
                                          <th style={{ padding: '8px 10px', textAlign: 'left', color: '#000', fontWeight: 600 }}>Date</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {items.map((item, j) => (
                                          <tr key={j} style={{ borderTop: '1px solid #f1f5f9' }}>
                                            <td style={{ padding: '6px 10px', color: '#000' }}>{j + 1}</td>
                                            <td style={{ padding: '6px 10px', color: '#000', fontWeight: 500 }}>{item.itemCode || '—'}</td>
                                            <td style={{ padding: '6px 10px', color: '#000', textAlign: 'right' }}>{item.salesOrderQuantity ?? '—'}</td>
                                            <td style={{ padding: '6px 10px', color: '#000' }}>{item.salesUOM || '—'}</td>
                                            <td style={{ padding: '6px 10px', color: '#000', textAlign: 'right' }}>{item.rate ?? '—'}</td>
                                            <td style={{ padding: '6px 10px', color: '#000' }}>{item.dispatchDate || '—'}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              )}

                              {/* No data message */}
                              {items.length === 0 && !hdr && (
                                <div style={{
                                  padding: '14px 16px', borderRadius: 12,
                                  background: 'rgba(239, 68, 68, 0.06)',
                                  border: '1px solid rgba(239, 68, 68, 0.15)',
                                  color: '#f87171', fontSize: 13, textAlign: 'center',
                                  marginBottom: 12,
                                }}>
                                  No data extracted from this file. Check the errors below.
                                </div>
                              )}
                            </div>
                          )
                        })}

                        {/* ── Processing Errors ── */}
                        {allErrors.length > 0 && (
                          <div style={{
                            textAlign: 'left', padding: '14px 16px', borderRadius: 12,
                            background: 'rgba(239, 68, 68, 0.06)',
                            border: '1px solid rgba(239, 68, 68, 0.15)',
                            marginBottom: 24, maxHeight: 150, overflowY: 'auto',
                          }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: '#f87171', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>
                              Page Errors ({allErrors.length})
                            </div>
                            {allErrors.map((err, i) => (
                              <div key={i} style={{
                                fontSize: 11, padding: '4px 0', color: '#fca5a5',
                                borderBottom: '1px solid rgba(239,68,68,0.08)',
                              }}>
                                <strong>Page {err.page}:</strong> {err.error?.substring(0, 150) || 'Unknown error'}
                              </div>
                            ))}
                          </div>
                        )}

                        {/* ── JSON Data Viewer (Sales Order) ── */}
                        {extractResult.data && (
                          <div style={{ marginBottom: 24 }}>
                            <button
                              onClick={() => setShowJson(!showJson)}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                                padding: '10px 16px',
                                borderRadius: 10,
                                background: showJson ? 'rgba(124, 58, 237, 0.08)' : '#f8fafc',
                                border: `1px solid ${showJson ? 'rgba(124, 58, 237, 0.3)' : '#e2e8f0'}`,
                                color: showJson ? '#1A5EA8' : '#000',
                                fontSize: 13,
                                fontWeight: 600,
                                cursor: 'pointer',
                                width: '100%',
                                justifyContent: 'center',
                                transition: 'all 0.2s',
                              }}
                            >
                              <span>{showJson ? '▼' : '▶'}</span>
                              {showJson ? 'Hide' : 'View'} Extracted JSON Data
                            </button>
                            {showJson && (
                              <div
                                style={{
                                  marginTop: 10,
                                  padding: '16px',
                                  borderRadius: 12,
                                  background: '#0f172a',
                                  border: '1px solid #1e293b',
                                  maxHeight: 300,
                                  overflowY: 'auto',
                                  textAlign: 'left',
                                }}
                              >
                                <pre
                                  style={{
                                    margin: 0,
                                    fontFamily: "'JetBrains Mono', monospace",
                                    fontSize: 11,
                                    lineHeight: 1.6,
                                    color: '#a5f3fc',
                                    whiteSpace: 'pre-wrap',
                                    wordBreak: 'break-word',
                                  }}
                                >
                                  {JSON.stringify(extractResult.data, null, 2)}
                                </pre>
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    )
                  })() : (
                    /* ── Costing / ECI Results (existing) ── */
                    <>
                      <p style={{ color: '#000', fontSize: 14, marginBottom: 24 }}>
                        <strong style={{ color: '#000' }}>{extractResult.file_name}</strong>
                        {' '}— {extractResult.total_pages} page{extractResult.total_pages !== 1 ? 's' : ''} processed
                      </p>

                      {/* Results Summary Cards */}
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(2, 1fr)',
                          gap: 12,
                          marginBottom: 24,
                          textAlign: 'center',
                        }}
                      >
                        {[
                          {
                            label: 'Data Points',
                            value: extractResult.data?.accuracy_summary?.total_data_points || '—',
                            icon: 'bar-chart',
                          },
                          {
                            label: 'Accuracy',
                            value: extractResult.data?.accuracy_summary?.overall_accuracy_pct
                              ? `${extractResult.data.accuracy_summary.overall_accuracy_pct}%`
                              : '—',
                            icon: 'star',
                          },
                        ].map((stat, i) => (
                          <div
                            key={i}
                            style={{
                              padding: '18px 12px',
                              borderRadius: 14,
                              background: '#f8fafc',
                              border: '1px solid #e2e8f0',
                            }}
                          >
                            <div style={{ marginBottom: 6 }}><Icon name={stat.icon} size={24} color="#6366f1" /></div>
                            <div style={{ fontWeight: 800, color: '#000', fontSize: 20, marginBottom: 2 }}>
                              {stat.value}
                            </div>
                            <div style={{ color: '#000', fontSize: 11, fontWeight: 500 }}>{stat.label}</div>
                          </div>
                        ))}
                      </div>

                      {/* Section breakdown */}
                      {extractResult.data && (
                        <div
                          style={{
                            textAlign: 'left',
                            padding: '16px 20px',
                            borderRadius: 14,
                            background: '#f8fafc',
                            border: '1px solid #e2e8f0',
                            marginBottom: 16,
                            maxHeight: 180,
                            overflowY: 'auto',
                          }}
                        >
                          <div style={{ fontSize: 12, fontWeight: 700, color: '#000', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 }}>
                            Extracted Sections
                          </div>
                          {[
                            ['Title Block', extractResult.data.title_block],
                            ['Dimensions', extractResult.data.dimensions],
                            ['Coordinates', extractResult.data.coordinate_points],
                            ['BOM', extractResult.data.bom],
                            ['Notes', extractResult.data.notes],
                            ['Standards', extractResult.data.standards],
                            ['Tolerances', extractResult.data.general_tolerances],
                            ['Marking', extractResult.data.marking_table],
                            ['Revisions', extractResult.data.revision_history],
                            ['Derived Data', extractResult.data.derived_data],
                            ['Costing Input', extractResult.data.costing_input],
                          ]
                            .filter(([, arr]) => arr && arr.length > 0)
                            .map(([name, arr], i) => (
                              <div
                                key={i}
                                style={{
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  padding: '5px 0',
                                  borderBottom: '1px solid #f1f5f9',
                                  fontSize: 13,
                                }}
                              >
                                <span style={{ color: '#000' }}>{name}</span>
                                <span style={{ color: '#000', fontWeight: 600 }}>{arr.length} items</span>
                              </div>
                            ))}
                        </div>
                      )}

                      {/* JSON Data Viewer */}
                      {extractResult.data && (
                        <div style={{ marginBottom: 24 }}>
                          <button
                            onClick={() => setShowJson(!showJson)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 8,
                              padding: '10px 16px',
                              borderRadius: 10,
                              background: showJson ? 'rgba(124, 58, 237, 0.08)' : '#f8fafc',
                              border: `1px solid ${showJson ? 'rgba(124, 58, 237, 0.3)' : '#e2e8f0'}`,
                              color: showJson ? '#1A5EA8' : '#000',
                              fontSize: 13,
                              fontWeight: 600,
                              cursor: 'pointer',
                              width: '100%',
                              justifyContent: 'center',
                              transition: 'all 0.2s',
                            }}
                          >
                            <span>{showJson ? '▼' : '▶'}</span>
                            {showJson ? 'Hide' : 'View'} Extracted JSON Data
                          </button>
                          {showJson && (
                            <div
                              style={{
                                marginTop: 10,
                                padding: '16px',
                                borderRadius: 12,
                                background: '#0f172a',
                                border: '1px solid #1e293b',
                                maxHeight: 300,
                                overflowY: 'auto',
                                textAlign: 'left',
                              }}
                            >
                              <pre
                                style={{
                                  margin: 0,
                                  fontFamily: "'JetBrains Mono', monospace",
                                  fontSize: 11,
                                  lineHeight: 1.6,
                                  color: '#a5f3fc',
                                  whiteSpace: 'pre-wrap',
                                  wordBreak: 'break-word',
                                }}
                              >
                                {JSON.stringify(extractResult.data, null, 2)}
                              </pre>
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  )}

                  {/* Action Buttons */}
                  <div style={{
                    display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap',
                    position: 'sticky', bottom: 0,
                    background: '#ffffff',
                    padding: '16px 0 8px',
                    borderTop: '1px solid #e2e8f0',
                    marginTop: 16,
                    zIndex: 10,
                  }}>
                    <button
                      onClick={handleDownloadExcel}
                      disabled={downloading}
                      style={{
                        padding: '14px 32px',
                        borderRadius: 12,
                        border: 'none',
                        background: downloading
                          ? '#94a3b8'
                          : 'linear-gradient(135deg, #10b981, #059669)',
                        color: '#fff',
                        fontSize: 15,
                        fontWeight: 700,
                        cursor: downloading ? 'wait' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        boxShadow: downloading ? 'none' : '0 8px 28px rgba(16, 185, 129, 0.3)',
                        transition: 'transform 0.2s, box-shadow 0.2s',
                      }}
                      onMouseEnter={(e) => {
                        if (!downloading) {
                          e.currentTarget.style.transform = 'translateY(-2px)'
                          e.currentTarget.style.boxShadow = '0 12px 36px rgba(16, 185, 129, 0.4)'
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!downloading) {
                          e.currentTarget.style.transform = 'translateY(0)'
                          e.currentTarget.style.boxShadow = '0 8px 28px rgba(16, 185, 129, 0.3)'
                        }
                      }}
                    >
                      {downloading ? (
                        <>
                          <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⏳</span>
                          Building Excel...
                        </>
                      ) : (
                        <><Icon name="download" size={16} color="#fff" style={{ marginRight: 6 }} /> Download Excel</>
                      )}
                    </button>
                    <button
                      onClick={handleDownloadJson}
                      style={{
                        padding: '14px 28px',
                        borderRadius: 12,
                        border: 'none',
                        background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
                        color: '#fff',
                        fontSize: 14,
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        boxShadow: '0 8px 28px rgba(59, 130, 246, 0.3)',
                        transition: 'transform 0.2s, box-shadow 0.2s',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'translateY(-2px)'
                        e.currentTarget.style.boxShadow = '0 12px 36px rgba(59, 130, 246, 0.4)'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'translateY(0)'
                        e.currentTarget.style.boxShadow = '0 8px 28px rgba(59, 130, 246, 0.3)'
                      }}
                    >
                      <><Icon name="clipboard" size={16} color="#6366f1" style={{ marginRight: 6 }} /> Download JSON</>
                    </button>
                    <button
                      onClick={handleClose}
                      style={{
                        padding: '14px 28px',
                        borderRadius: 12,
                        background: '#f1f5f9',
                        border: '1px solid #e2e8f0',
                        color: '#64748b',
                        fontSize: 14,
                        fontWeight: 600,
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                      }}
                    >
                      Close
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── Navigation Buttons ── */}
          {step < 3 && (
          <div
            style={{
              display: 'flex',
              gap: 12,
              marginTop: 30,
              justifyContent: step > 0 ? 'space-between' : 'flex-end',
            }}
          >
            {step > 0 && (
              <button
                onClick={handleBack}
                style={{
                  padding: '12px 30px',
                  borderRadius: 12,
                  background: '#f1f5f9',
                  border: '1px solid #e2e8f0',
                  color: '#64748b',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.target.style.background = '#e2e8f0'
                  e.target.style.color = '#1e293b'
                }}
                onMouseLeave={(e) => {
                  e.target.style.background = '#f1f5f9'
                  e.target.style.color = '#64748b'
                }}
              >
                ← Back
              </button>
            )}

            {step < 2 && (
              <button
                onClick={handleContinue}
                disabled={!canContinue}
                style={{
                  padding: '12px 34px',
                  borderRadius: 12,
                  border: 'none',
                  background: canContinue
                    ? 'linear-gradient(135deg, #1A5EA8, #1552A0)'
                    : '#f1f5f9',
                  color: canContinue ? '#fff' : '#94a3b8',
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: canContinue ? 'pointer' : 'not-allowed',
                  transition: 'all 0.3s',
                  boxShadow: canContinue ? '0 4px 18px rgba(124, 58, 237, 0.3)' : 'none',
                }}
              >
                Continue →
              </button>
            )}
          </div>
          )}
        </div>
      </div>
    </div>
  )
}
