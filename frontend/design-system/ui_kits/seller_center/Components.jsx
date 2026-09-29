// Seller Experience — Responsive UI Kit (Internal Tools)
// Breakpoints: mobile <768 · tablet 768-1023 · desktop ≥1024

const RC = {
  // Sidebar
  sidebar:    '#1E1E1E',
  sidebarB:   'rgba(255,255,255,0.08)',
  topbar:     '#1A1A1A',
  topbarB:    'rgba(255,255,255,0.08)',

  // Surfaces
  bg:         '#F0F0F0',
  surface:    '#FFFFFF',
  surface2:   '#FAFAFA',
  border:     '#E4E4E4',
  borderHov:  '#C8C8C8',

  // Brand
  green:   '#5BA64A', greenL:  '#D4EDD0', greenD: '#3D7A30',
  blue:    '#3B5BA5', blueL:   '#D0DAEF',
  red:     '#D91F4D', redL:    '#FAD0DC',
  orange:  '#E97132', orangeL: '#FDECD9',
  yellow:  '#D4A017', yellowL: '#FDF3D0',

  // Text
  fg:  '#1A1A1A', fg2: '#5C5C5C', fg3: '#9E9E9E',
  sfg: '#FFFFFF', sfg2: 'rgba(255,255,255,0.62)', sfg3: 'rgba(255,255,255,0.30)',
};

// ─── useViewport hook ─────────────────────────────────────────────────
// Reads from the container that wraps the app, NOT window.innerWidth,
// so the drag-to-resize preview works correctly.
function useViewport(containerRef) {
  const [width, setWidth] = React.useState(() =>
    containerRef?.current?.offsetWidth || (typeof window !== 'undefined' ? window.innerWidth : 1280)
  );

  React.useEffect(() => {
    const el = containerRef?.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      for (const e of entries) setWidth(Math.round(e.contentRect.width));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [containerRef]);

  const breakpoint = width < 768 ? 'mobile' : width < 1024 ? 'tablet' : 'desktop';
  return { width, breakpoint, isMobile: breakpoint === 'mobile', isTablet: breakpoint === 'tablet', isDesktop: breakpoint === 'desktop' };
}

// ─── NAV (internal tools) ─────────────────────────────────────────────
const RNAV = [
  { id: 'overview',    label: 'Overview',          icon: '◰', dot: null         },
  { id: 'journey',     label: 'Seller Journey',    icon: '◇', dot: null         },
  { id: 'inbound',     label: 'Inbound',           icon: '↘', dot: '8'          },
  { id: 'compliance',  label: 'Compliance',        icon: '✓', dot: null         },
  { id: 'support',     label: 'Soporte',           icon: '◊', dot: '4', alert: true },
  { id: 'performance', label: 'Performance',       icon: '↗', dot: null         },
  { id: 'loyalty',     label: 'Loyalty',           icon: '★', dot: null         },
  { id: 'analytics',   label: 'Analytics',         icon: '◫', dot: null         },
  { id: 'comms',       label: 'Comms & Marketing', icon: '✉', dot: '2'          },
  { id: 'settings',    label: 'Config',            icon: '⚙', dot: null         },
];

// ─── Sidebar (responsive) ─────────────────────────────────────────────
// desktop: full 220px · tablet: icon rail 64px · mobile: drawer overlay
function ResponsiveSidebar({ active, onNav, breakpoint, drawerOpen, onCloseDrawer }) {
  const isMobile = breakpoint === 'mobile';
  const isTablet = breakpoint === 'tablet';
  const isDesktop = breakpoint === 'desktop';

  const railWidth = isTablet ? 64 : 220;
  const showLabels = !isTablet;

  // On mobile, render as overlay drawer. On tablet/desktop, render inline.
  const inner = (
    <aside style={{
      width: isMobile ? 280 : railWidth,
      background: RC.sidebar,
      borderRight: `1px solid ${RC.sidebarB}`,
      height: '100%',
      display: 'flex', flexDirection: 'column', flexShrink: 0,
      transition: 'width 0.18s ease',
    }}>
      {/* Logo */}
      <div style={{ padding: isTablet ? '14px 0' : '16px 14px', borderBottom: `1px solid ${RC.sidebarB}`, display: 'flex', alignItems: 'center', justifyContent: isTablet ? 'center' : 'flex-start' }}>
        {isTablet ? (
          <div style={{ width: 32, height: 32, borderRadius: 7, background: RC.green, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 13, fontFamily: 'Montserrat, sans-serif' }}>SX</div>
        ) : (
          <div style={{ flex: 1 }}>
            <img src="../../assets/logo.png" alt="Seller Experience" style={{ width: '100%', height: 22, objectFit: 'contain', filter: 'invert(1) brightness(1.8)' }} />
            <div style={{ marginTop: 7, fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: RC.sfg3 }}>Seller Experience · Internal</div>
          </div>
        )}
        {isMobile && (
          <button onClick={onCloseDrawer} style={{ background: 'none', border: 'none', color: RC.sfg2, fontSize: 22, cursor: 'pointer', padding: 4, marginLeft: 'auto' }}>×</button>
        )}
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: isTablet ? '6px 8px' : '8px', overflowY: 'auto' }}>
        {RNAV.map(item => {
          const isActive = active === item.id;
          return (
            <button
              key={item.id}
              onClick={() => { onNav(item.id); if (isMobile) onCloseDrawer(); }}
              title={isTablet ? item.label : undefined}
              style={{
                display: 'flex', alignItems: 'center',
                justifyContent: isTablet ? 'center' : 'space-between',
                width: '100%', padding: isTablet ? '10px 0' : '9px 11px',
                border: 'none', borderRadius: 7,
                background: isActive ? 'rgba(91,166,74,0.16)' : 'transparent',
                color: isActive ? RC.green : RC.sfg2,
                fontFamily: 'Inter, sans-serif', fontSize: 13,
                fontWeight: isActive ? 600 : 400,
                cursor: 'pointer', transition: 'all 0.12s ease',
                textAlign: 'left', marginBottom: 1,
                borderLeft: !isTablet && isActive ? `2px solid ${RC.green}` : '2px solid transparent',
                position: 'relative',
              }}
              onMouseEnter={e => { if (!isActive) { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = RC.sfg; } }}
              onMouseLeave={e => { if (!isActive) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = RC.sfg2; } }}
            >
              {isTablet ? (
                <>
                  <span style={{ fontSize: 18, lineHeight: 1 }}>{item.icon}</span>
                  {item.dot && (
                    <span style={{ position: 'absolute', top: 4, right: 8, width: 6, height: 6, borderRadius: '50%', background: item.alert ? RC.red : RC.green }} />
                  )}
                </>
              ) : (
                <>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                    <span style={{ fontSize: 14, opacity: 0.7, width: 16, textAlign: 'center' }}>{item.icon}</span>
                    <span>{item.label}</span>
                  </span>
                  {item.dot && (
                    <span style={{
                      background: item.alert ? RC.red : 'rgba(255,255,255,0.14)',
                      color: item.alert ? '#fff' : RC.sfg2,
                      fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 9999,
                    }}>{item.dot}</span>
                  )}
                </>
              )}
            </button>
          );
        })}
      </nav>

      {/* User footer */}
      {!isTablet && (
        <div style={{ padding: '10px 12px', borderTop: `1px solid ${RC.sidebarB}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <div style={{ width: 30, height: 30, borderRadius: '50%', background: RC.green, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>AV</div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: RC.sfg, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Ana Valdés</div>
              <div style={{ fontSize: 10, color: RC.sfg3 }}>Seller Experience</div>
            </div>
          </div>
        </div>
      )}
      {isTablet && (
        <div style={{ padding: '12px 0', borderTop: `1px solid ${RC.sidebarB}`, display: 'flex', justifyContent: 'center' }}>
          <div style={{ width: 30, height: 30, borderRadius: '50%', background: RC.green, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 11, fontWeight: 700 }}>AV</div>
        </div>
      )}
    </aside>
  );

  if (!isMobile) return inner;

  // Mobile: overlay drawer
  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onCloseDrawer}
        style={{
          position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)',
          opacity: drawerOpen ? 1 : 0,
          pointerEvents: drawerOpen ? 'auto' : 'none',
          transition: 'opacity 0.2s ease',
          zIndex: 90,
        }}
      />
      {/* Drawer */}
      <div style={{
        position: 'absolute', top: 0, left: 0, bottom: 0,
        transform: drawerOpen ? 'translateX(0)' : 'translateX(-100%)',
        transition: 'transform 0.22s cubic-bezier(0.4, 0, 0.2, 1)',
        zIndex: 100, boxShadow: drawerOpen ? '4px 0 24px rgba(0,0,0,0.3)' : 'none',
      }}>
        {inner}
      </div>
    </>
  );
}

// ─── TopBar (responsive) ──────────────────────────────────────────────
function ResponsiveTopBar({ title, subtitle, breakpoint, onOpenDrawer }) {
  const isMobile = breakpoint === 'mobile';
  const isTablet = breakpoint === 'tablet';
  const isDesktop = breakpoint === 'desktop';
  const [searchOpen, setSearchOpen] = React.useState(false);

  return (
    <div style={{
      height: isMobile ? 52 : 48,
      background: RC.topbar,
      borderBottom: `1px solid ${RC.topbarB}`,
      display: 'flex', alignItems: 'center',
      padding: isMobile ? '0 12px' : '0 16px',
      gap: isMobile ? 8 : 12, flexShrink: 0,
    }}>
      {/* Hamburger (mobile only) */}
      {isMobile && (
        <button onClick={onOpenDrawer} aria-label="Abrir menú" style={{
          background: 'rgba(255,255,255,0.06)', border: `1px solid ${RC.sidebarB}`, borderRadius: 6,
          width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', color: RC.sfg, padding: 0, flexShrink: 0,
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span style={{ width: 14, height: 1.5, background: RC.sfg, borderRadius: 1 }} />
            <span style={{ width: 14, height: 1.5, background: RC.sfg, borderRadius: 1 }} />
            <span style={{ width: 14, height: 1.5, background: RC.sfg, borderRadius: 1 }} />
          </div>
        </button>
      )}

      {/* Title */}
      {!searchOpen && (
        <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'baseline', gap: 10, overflow: 'hidden' }}>
          <span style={{
            fontFamily: 'Montserrat, sans-serif', fontWeight: 800,
            fontSize: isMobile ? 14 : 15,
            color: RC.sfg, letterSpacing: '-0.03em',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>{title}</span>
          {subtitle && !isMobile && (
            <span style={{ fontSize: 12, color: RC.sfg3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{subtitle}</span>
          )}
        </div>
      )}

      {/* Search */}
      {isDesktop ? (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: 'rgba(255,255,255,0.07)', border: `1px solid ${RC.sidebarB}`,
          borderRadius: 6, padding: '5px 12px', width: 220,
        }}>
          <span style={{ color: RC.sfg3, fontSize: 12 }}>⌘</span>
          <span style={{ color: RC.sfg3, fontSize: 12, flex: 1 }}>Buscar o ejecutar...</span>
          <kbd style={{ fontSize: 10, color: RC.sfg3, background: 'rgba(255,255,255,0.08)', padding: '1px 5px', borderRadius: 3 }}>K</kbd>
        </div>
      ) : searchOpen ? (
        <div style={{
          flex: 1, display: 'flex', alignItems: 'center', gap: 8,
          background: 'rgba(255,255,255,0.10)', border: `1px solid ${RC.sidebarB}`,
          borderRadius: 6, padding: '5px 12px',
        }}>
          <span style={{ color: RC.sfg3, fontSize: 12 }}>⌘</span>
          <input autoFocus placeholder="Buscar o ejecutar..." onBlur={() => setSearchOpen(false)} style={{
            flex: 1, background: 'transparent', border: 'none', outline: 'none',
            color: RC.sfg, fontFamily: 'Inter, sans-serif', fontSize: 13,
          }} />
        </div>
      ) : (
        <button onClick={() => setSearchOpen(true)} aria-label="Buscar" style={{
          background: 'rgba(255,255,255,0.06)', border: `1px solid ${RC.sidebarB}`, borderRadius: 6,
          width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', color: RC.sfg2, fontSize: 14, padding: 0,
        }}>⌘</button>
      )}

      {/* Alert chip — desktop + tablet (compact on tablet) */}
      {!isMobile && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          background: 'rgba(217,31,77,0.18)', border: '1px solid rgba(217,31,77,0.30)',
          borderRadius: 6, padding: '4px 10px', cursor: 'pointer', flexShrink: 0,
        }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: RC.red, display: 'inline-block' }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: '#F07294', whiteSpace: 'nowrap' }}>
            {isTablet ? '4 SLA' : '4 escalaciones activas'}
          </span>
        </div>
      )}

      {/* Markets — desktop only */}
      {isDesktop && (
        <div style={{ display: 'flex', gap: 4 }}>
          {['🇨🇱', '🇵🇪', '🇨🇴'].map(f => (
            <span key={f} style={{ fontSize: 16, cursor: 'pointer', opacity: 0.8 }}>{f}</span>
          ))}
        </div>
      )}

      {/* Avatar */}
      <div style={{
        width: isMobile ? 30 : 28, height: isMobile ? 30 : 28, borderRadius: '50%',
        background: RC.green, display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#fff', fontSize: 11, fontWeight: 700, flexShrink: 0, cursor: 'pointer',
      }}>AV</div>
    </div>
  );
}

// ─── Badge ─────────────────────────────────────────────────────────────
function Badge({ type, children }) {
  const styles = {
    success: { bg: RC.greenL,  color: RC.greenD },
    danger:  { bg: RC.redL,    color: '#A81839' },
    warning: { bg: RC.orangeL, color: '#C05A1A' },
    info:    { bg: RC.blueL,   color: '#2B4492' },
    neutral: { bg: '#EEEEEE',  color: RC.fg2    },
    yellow:  { bg: RC.yellowL, color: '#8A6A00' },
  };
  const s = styles[type] || styles.neutral;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      background: s.bg, color: s.color,
      fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 9999,
      fontFamily: 'Inter, sans-serif', whiteSpace: 'nowrap',
    }}>
      <span style={{ width: 4, height: 4, borderRadius: '50%', background: s.color }} />
      {children}
    </span>
  );
}

// ─── KPI Card ──────────────────────────────────────────────────────────
function MiniKPI({ label, value, delta, deltaUp, accent, compact }) {
  return (
    <div style={{
      background: RC.surface, border: `1px solid ${RC.border}`, borderRadius: 8,
      padding: compact ? '12px 14px' : '14px 16px',
      flex: '0 0 auto', minWidth: 0,
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: RC.fg3, marginBottom: 6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</div>
      <div style={{ fontFamily: 'Montserrat, sans-serif', fontSize: compact ? 22 : 26, fontWeight: 800, color: accent || RC.fg, letterSpacing: '-0.04em', lineHeight: 1 }}>{value}</div>
      {delta && (
        <div style={{ fontSize: 11, fontWeight: 600, color: deltaUp ? RC.green : RC.red, marginTop: 5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {deltaUp ? '↑' : '↓'} {delta}
        </div>
      )}
    </div>
  );
}

// ─── KPI Row (responsive layout switcher) ──────────────────────────────
// mobile → horizontal carousel · tablet → 2 cols grid · desktop → flex row
function KPIRow({ items, breakpoint }) {
  if (breakpoint === 'mobile') {
    return (
      <div style={{
        display: 'flex', gap: 10, overflowX: 'auto',
        scrollSnapType: 'x mandatory',
        paddingBottom: 4, marginRight: -16, paddingRight: 16, // bleed for last card
        WebkitOverflowScrolling: 'touch',
      }}>
        {items.map((it, i) => (
          <div key={i} style={{ scrollSnapAlign: 'start', minWidth: '60%', maxWidth: '60%', display: 'flex' }}>
            <MiniKPI {...it} compact />
          </div>
        ))}
      </div>
    );
  }
  if (breakpoint === 'tablet') {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
        {items.map((it, i) => <MiniKPI key={i} {...it} compact />)}
      </div>
    );
  }
  // desktop
  return (
    <div style={{ display: 'flex', gap: 10 }}>
      {items.map((it, i) => <div key={i} style={{ flex: 1, display: 'flex' }}><MiniKPI {...it} /></div>)}
    </div>
  );
}

// ─── Responsive Table ──────────────────────────────────────────────────
// desktop: full table · tablet: scroll-x · mobile: cards
function ResponsiveTable({ columns, rows, breakpoint, getRowAccent }) {
  const isMobile = breakpoint === 'mobile';

  if (isMobile) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rows.map((row, i) => (
          <div key={i} style={{
            background: RC.surface, border: `1px solid ${RC.border}`, borderRadius: 8,
            padding: 12, display: 'flex', flexDirection: 'column', gap: 8,
            borderLeft: getRowAccent ? `3px solid ${getRowAccent(row)}` : `1px solid ${RC.border}`,
          }}>
            {columns.map(col => {
              const val = col.render ? col.render(row) : row[col.key];
              if (col.primary) {
                return (
                  <div key={col.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ minWidth: 0, fontWeight: 600, color: RC.fg, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{val}</div>
                    {col.trailing && col.trailing(row)}
                  </div>
                );
              }
              if (col.hideOnMobile) return null;
              return (
                <div key={col.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, fontSize: 12 }}>
                  <span style={{ color: RC.fg3, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: 10 }}>{col.label}</span>
                  <span style={{ color: RC.fg2, textAlign: 'right', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{val}</span>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    );
  }

  // desktop + tablet — table with horizontal scroll on tablet
  return (
    <div style={{ background: RC.surface, border: `1px solid ${RC.border}`, borderRadius: 8, overflow: 'hidden' }}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: breakpoint === 'tablet' ? 720 : 'auto' }}>
          <thead>
            <tr style={{ background: RC.bg }}>
              {columns.map(col => (
                <th key={col.key} style={{
                  padding: '8px 12px', textAlign: 'left', fontWeight: 600,
                  fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase',
                  color: RC.fg3, borderBottom: `1px solid ${RC.border}`, whiteSpace: 'nowrap',
                }}>{col.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}
                style={{ borderBottom: i < rows.length - 1 ? `1px solid ${RC.border}` : 'none', cursor: 'pointer', transition: 'background 0.1s' }}
                onMouseEnter={e => e.currentTarget.style.background = RC.bg}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                {columns.map(col => (
                  <td key={col.key} style={{ padding: '9px 12px', verticalAlign: 'middle', whiteSpace: col.nowrap === false ? 'normal' : 'nowrap', maxWidth: col.maxWidth }}>
                    {col.render ? col.render(row) : row[col.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Section / Card ────────────────────────────────────────────────────
function Card({ title, action, accent, children, padding = 14 }) {
  return (
    <div style={{ background: RC.surface, border: `1px solid ${RC.border}`, borderRadius: 8, overflow: 'hidden' }}>
      {title && (
        <div style={{
          padding: '10px 14px', borderBottom: `1px solid ${RC.border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
          background: accent || 'transparent', minHeight: 40,
        }}>
          <span style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 800, fontSize: 13, color: RC.fg, letterSpacing: '-0.02em' }}>{title}</span>
          {action}
        </div>
      )}
      <div style={{ padding }}>{children}</div>
    </div>
  );
}

// ─── Filter Bar ────────────────────────────────────────────────────────
function FilterBar({ filters, active, onChange, action, breakpoint }) {
  const isMobile = breakpoint === 'mobile';
  return (
    <div style={{
      display: 'flex', gap: 8, alignItems: 'center',
      flexWrap: isMobile ? 'nowrap' : 'wrap',
      overflowX: isMobile ? 'auto' : 'visible',
      paddingBottom: isMobile ? 4 : 0,
    }}>
      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
        {filters.map(f => {
          const isActive = active === f;
          return (
            <button key={f} onClick={() => onChange(f)} style={{
              fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: isActive ? 600 : 400,
              padding: '5px 12px', borderRadius: 6,
              border: `1px solid ${isActive ? RC.green : RC.border}`,
              background: isActive ? RC.greenL : RC.surface,
              color: isActive ? RC.greenD : RC.fg2,
              cursor: 'pointer', transition: 'all 0.12s', whiteSpace: 'nowrap',
            }}>{f}</button>
          );
        })}
      </div>
      {action && !isMobile && (
        <>
          <div style={{ flex: 1 }} />
          {action}
        </>
      )}
    </div>
  );
}

Object.assign(window, {
  RC, RNAV, useViewport,
  ResponsiveSidebar, ResponsiveTopBar,
  Badge, MiniKPI, KPIRow, ResponsiveTable, Card, FilterBar,
});
