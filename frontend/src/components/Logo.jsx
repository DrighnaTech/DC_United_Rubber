import logoImg from '../../Logo/datacaffe_logo.png'

/**
 * DataCaffé Logo — image on left, "United Rubber" text on right
 */
export default function Logo({ size = 44, showText = true, light = false }) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      cursor: 'pointer',
    }}>
      {/* Logo image — left */}
      <div style={{
        width: size,
        height: size,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}>
        <img
          src={logoImg}
          alt="DataCaffé"
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            /* White logo on dark bg, natural colors on light bg */
            filter: light ? 'brightness(0) invert(1)' : 'none',
            transition: 'filter 0.3s ease',
          }}
        />
      </div>

      {/* Text on right */}
      {showText && (
        <div style={{ lineHeight: 1.2 }}>
          <div style={{
            fontFamily: "'Playfair Display', serif",
            fontWeight: 800,
            fontSize: size > 36 ? 20 : 15,
            letterSpacing: '-0.01em',
            lineHeight: 1.1,
            whiteSpace: 'nowrap',
          }}>
            <>
              <span style={{ color: '#F07621' }}>United</span>{' '}
              <span style={{ color: '#1A5EA8' }}>Rubber</span>
            </>
          </div>
        </div>
      )}
    </div>
  )
}
