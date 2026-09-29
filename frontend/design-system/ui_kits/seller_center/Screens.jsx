// Seller Experience Internal Tools — Responsive Screens

// ─── OVERVIEW ──────────────────────────────────────────────────────────
function OverviewScreenR({ breakpoint }) {
  const kpis = [
    { label: 'Sellers activos',    value: '4,821', delta: '38 esta semana',  deltaUp: true },
    { label: 'Tasa activación',    value: '73.4%', delta: '2.1% vs sem ant', deltaUp: true },
    { label: 'Tickets abiertos',   value: '127',   delta: '14 críticos',     deltaUp: false, accent: RC.red },
    { label: 'SLA compliance',     value: '91.2%', delta: '2.3% vs objetivo',deltaUp: false, accent: RC.orange },
    { label: 'Uptime plataforma',  value: '99.7%', delta: '30 días',         deltaUp: true,  accent: RC.green },
  ];

  const escalations = [
    { id: 'INC-0041', market: '🇨🇴', title: 'Falla en carga de imágenes',         sev: 'danger',  sla: '00:42 restante', owner: 'J. Morales' },
    { id: 'INC-0042', market: '🇵🇪', title: 'Demora en sincronización inventario',sev: 'warning', sla: '02:15 restante', owner: 'A. Valdés'  },
    { id: 'INC-0043', market: '🇨🇱', title: 'API precios — latencia p95 >800ms',  sev: 'warning', sla: '01:30 restante', owner: 'R. Lagos'   },
    { id: 'INC-0044', market: '🇨🇴', title: 'Seller no puede publicar — 422',     sev: 'danger',  sla: 'VENCIDO',        owner: 'P. García'  },
  ];

  const escCols = [
    { key: 'id', label: 'ID', primary: true,
      render: r => <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: RC.blue, fontWeight: 500 }}>{r.id}</span>,
      trailing: r => <Badge type={r.sev}>{r.sev === 'danger' ? 'Crítico' : 'Medio'}</Badge> },
    { key: 'market', label: 'Mercado',
      render: r => <span style={{ fontSize: 15 }}>{r.market}</span> },
    { key: 'title', label: 'Incidente', maxWidth: 240, nowrap: false,
      render: r => <span style={{ color: RC.fg }}>{r.title}</span> },
    { key: 'sev', label: 'Severidad', hideOnMobile: true,
      render: r => <Badge type={r.sev}>{r.sev === 'danger' ? 'Crítico' : 'Medio'}</Badge> },
    { key: 'sla', label: 'SLA',
      render: r => <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: r.sla === 'VENCIDO' ? RC.red : RC.orange, fontWeight: 600 }}>{r.sla}</span> },
    { key: 'owner', label: 'Dueño',
      render: r => <span style={{ color: RC.fg2 }}>{r.owner}</span> },
  ];

  const services = [
    ['Catalog API', 'success'],   ['Pricing API', 'danger'],
    ['Order Service','success'],  ['Auth Service','success'],
    ['Search Engine','warning'],  ['Notifications','success'],
  ];

  const deployments = [
    { app: 'seller-center-frontend', version: 'v2.14.1', env: 'Production', market: '🇨🇱🇵🇪🇨🇴', status: 'success', time: 'hace 2h' },
    { app: 'catalog-service',        version: 'v1.8.3',  env: 'Staging',    market: '🇨🇴',       status: 'warning', time: 'hace 4h' },
    { app: 'pricing-api',            version: 'v3.2.0',  env: 'Production', market: '🇨🇱',       status: 'danger',  time: 'hace 6h' },
  ];

  const funnel = [
    { label: 'Registros',     value: 312, pct: 100, color: RC.blue   },
    { label: 'Onboarding',    value: 248, pct: 79,  color: RC.blue   },
    { label: 'Doc enviada',   value: 201, pct: 64,  color: RC.green  },
    { label: 'Doc aprobada',  value: 174, pct: 56,  color: RC.green  },
    { label: 'Primera pub.',  value: 138, pct: 44,  color: RC.orange },
    { label: 'Primera venta', value: 89,  pct: 29,  color: RC.orange },
  ];

  const isMobile = breakpoint === 'mobile';
  const isDesktop = breakpoint === 'desktop';
  const padding = isMobile ? 12 : 16;

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding, background: RC.bg, display: 'flex', flexDirection: 'column', gap: isMobile ? 12 : 14 }}>
      <KPIRow items={kpis} breakpoint={breakpoint} />

      <div style={{ display: isDesktop ? 'flex' : 'block', gap: 14 }}>
        <div style={{ flex: 1.4, display: isDesktop ? 'block' : undefined, marginBottom: isDesktop ? 0 : 14 }}>
          <Card
            title="Escalaciones activas"
            accent="#FFF8F8"
            action={<Badge type="danger">4 abiertas</Badge>}
            padding={0}
          >
            <div style={{ padding: 12 }}>
              <ResponsiveTable
                columns={escCols}
                rows={escalations}
                breakpoint={breakpoint}
                getRowAccent={r => r.sev === 'danger' ? RC.red : RC.orange}
              />
            </div>
          </Card>
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: isMobile ? 12 : 10 }}>
          <Card
            title="Despliegues recientes"
            action={<button style={{ fontSize: 11, fontWeight: 600, color: RC.blue, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>Ver todos →</button>}
            padding={0}
          >
            {deployments.map((d, i) => (
              <div key={d.app} style={{ padding: '10px 14px', borderBottom: i < deployments.length - 1 ? `1px solid ${RC.border}` : 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4, gap: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: RC.fg, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.app}</span>
                  <Badge type={d.status}>{d.status === 'success' ? 'OK' : d.status === 'warning' ? 'Degradado' : 'Falla'}</Badge>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, fontSize: 11, color: RC.fg3 }}>
                  <span style={{ fontFamily: 'JetBrains Mono, monospace' }}>{d.version}</span>
                  <span>{d.env}</span>
                  <span>{d.market}</span>
                  <span style={{ marginLeft: 'auto' }}>{d.time}</span>
                </div>
              </div>
            ))}
          </Card>

          <Card title="Estado de servicios">
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : '1fr 1fr', gap: 8 }}>
              {services.map(([name, s]) => (
                <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: s === 'success' ? RC.green : s === 'danger' ? RC.red : RC.orange, flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: RC.fg2 }}>{name}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      {/* Funnel */}
      <Card title="Funnel de activación — esta semana">
        {isMobile ? (
          // Mobile: vertical bars
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {funnel.map((step, i) => (
              <div key={step.label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 110, fontSize: 12, color: RC.fg2 }}>{step.label}</div>
                <div style={{ flex: 1, height: 22, background: RC.bg, borderRadius: 4, position: 'relative', overflow: 'hidden' }}>
                  <div style={{ position: 'absolute', inset: 0, width: `${step.pct}%`, background: step.color, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 8 }}>
                    <span style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 800, fontSize: 11, color: '#fff' }}>{step.value}</span>
                  </div>
                </div>
                <div style={{ width: 36, fontSize: 11, color: RC.fg3, textAlign: 'right' }}>{step.pct}%</div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'stretch', gap: 0 }}>
            {funnel.map((step, i, arr) => (
              <div key={step.label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
                <div style={{
                  width: '90%', height: 32,
                  background: `${step.color}${Math.round(step.pct * 2.55).toString(16).padStart(2, '0')}`,
                  borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <span style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 800, fontSize: 14, color: '#fff', letterSpacing: '-0.02em' }}>{step.value}</span>
                </div>
                <div style={{ fontSize: 10, color: RC.fg3, textAlign: 'center', lineHeight: 1.3 }}>{step.label}</div>
                {i < arr.length - 1 && <div style={{ fontSize: 10, color: RC.fg3 }}>→ {Math.round((arr[i + 1].value / step.value) * 100)}%</div>}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

// ─── SELLERS / JOURNEY ────────────────────────────────────────────────
function SellersScreenR({ breakpoint }) {
  const [filter, setFilter] = React.useState('Todos');
  const sellers = [
    { id: 'SEL-4821', name: 'MV Store',       market: '🇨🇱', plan: 'Pro',   gmv: '$4.2M',  productos: 347, activacion: 'success', sla: '99.1%', joined: 'Ene 2024' },
    { id: 'SEL-4822', name: 'TiendaPE Online',market: '🇵🇪', plan: 'Basic', gmv: 'S/890K', productos: 124, activacion: 'success', sla: '95.3%', joined: 'Mar 2024' },
    { id: 'SEL-4823', name: 'ColShop Co.',    market: '🇨🇴', plan: 'Pro',   gmv: '$1.1M',  productos: 58,  activacion: 'warning', sla: '88.4%', joined: 'Abr 2024' },
    { id: 'SEL-4824', name: 'ModaChile SA',   market: '🇨🇱', plan: 'Basic', gmv: '$620K',  productos: 210, activacion: 'success', sla: '97.8%', joined: 'Feb 2024' },
    { id: 'SEL-4825', name: 'TechImport Perú',market: '🇵🇪', plan: 'Pro',   gmv: 'S/340K', productos: 89,  activacion: 'danger',  sla: '72.1%', joined: 'May 2024' },
    { id: 'SEL-4826', name: 'HomeDecor Cali', market: '🇨🇴', plan: 'Basic', gmv: '$290K',  productos: 33,  activacion: 'warning', sla: '84.9%', joined: 'Mar 2024' },
  ];

  const cols = [
    { key: 'name', label: 'Nombre', primary: true,
      render: r => <span>{r.name}</span>,
      trailing: r => <Badge type={r.activacion}>{r.activacion === 'success' ? 'Activo' : r.activacion === 'warning' ? 'Parcial' : 'Bloqueado'}</Badge> },
    { key: 'id', label: 'ID', hideOnMobile: true,
      render: r => <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: RC.blue }}>{r.id}</span> },
    { key: 'market', label: 'Mercado',
      render: r => <span style={{ fontSize: 15 }}>{r.market}</span> },
    { key: 'plan', label: 'Plan',
      render: r => <Badge type={r.plan === 'Pro' ? 'info' : 'neutral'}>{r.plan}</Badge> },
    { key: 'gmv', label: 'GMV',
      render: r => <span style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontSize: 13, color: RC.fg, letterSpacing: '-0.02em' }}>{r.gmv}</span> },
    { key: 'productos', label: 'Productos', hideOnMobile: true,
      render: r => <span style={{ color: RC.fg2 }}>{r.productos}</span> },
    { key: 'activacion', label: 'Activación', hideOnMobile: true,
      render: r => <Badge type={r.activacion}>{r.activacion === 'success' ? 'Activo' : r.activacion === 'warning' ? 'Parcial' : 'Bloqueado'}</Badge> },
    { key: 'sla', label: 'SLA 30d',
      render: r => <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, fontWeight: 600, color: parseFloat(r.sla) >= 95 ? RC.green : parseFloat(r.sla) >= 85 ? RC.orange : RC.red }}>{r.sla}</span> },
    { key: 'joined', label: 'Ingreso', hideOnMobile: true,
      render: r => <span style={{ color: RC.fg3, fontSize: 11 }}>{r.joined}</span> },
  ];

  const padding = breakpoint === 'mobile' ? 12 : 16;

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding, background: RC.bg, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <KPIRow breakpoint={breakpoint} items={[
        { label: 'Sellers totales',  value: '4,821',  delta: '38 esta semana', deltaUp: true },
        { label: 'Sellers Pro',      value: '1,204',  delta: '12 nuevos',      deltaUp: true },
        { label: 'En riesgo (SLA)',  value: '89',     delta: 'vs 74 sem ant',  deltaUp: false, accent: RC.red },
        { label: 'GMV total',        value: '$28.4M', delta: '18.2% MoM',      deltaUp: true,  accent: RC.green },
      ]} />

      <FilterBar
        breakpoint={breakpoint}
        filters={['Todos', 'Activos', 'En riesgo', 'Inactivos']}
        active={filter}
        onChange={setFilter}
        action={<button style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 600, padding: '6px 14px', borderRadius: 6, background: RC.green, color: '#fff', border: 'none', cursor: 'pointer' }}>Exportar CSV</button>}
      />

      <ResponsiveTable
        columns={cols}
        rows={sellers}
        breakpoint={breakpoint}
        getRowAccent={r => r.activacion === 'success' ? RC.green : r.activacion === 'warning' ? RC.orange : RC.red}
      />
    </div>
  );
}

// ─── INBOUND ──────────────────────────────────────────────────────────
function InboundScreenR({ breakpoint }) {
  const queue = [
    { id: 'APP-1041', seller: 'Importadora Andina',  market: '🇨🇱', stage: 'Documentación',  age: '2d 4h', priority: 'high'   },
    { id: 'APP-1042', seller: 'Selva Trade SAC',     market: '🇵🇪', stage: 'KYC',            age: '1d 2h', priority: 'normal' },
    { id: 'APP-1043', seller: 'Bogotá Fashion Hub',  market: '🇨🇴', stage: 'Contrato',       age: '3d',    priority: 'high'   },
    { id: 'APP-1044', seller: 'TechMaster Cali',     market: '🇨🇴', stage: 'Validación SAT', age: '6h',    priority: 'normal' },
    { id: 'APP-1045', seller: 'Lima Style Co.',      market: '🇵🇪', stage: 'KYC',            age: '4h',    priority: 'low'    },
  ];

  const cols = [
    { key: 'seller', label: 'Empresa', primary: true,
      render: r => <span>{r.seller}</span>,
      trailing: r => <Badge type={r.priority === 'high' ? 'danger' : r.priority === 'normal' ? 'info' : 'neutral'}>{r.priority === 'high' ? 'Alta' : r.priority === 'normal' ? 'Normal' : 'Baja'}</Badge> },
    { key: 'id', label: 'Solicitud', hideOnMobile: true,
      render: r => <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: RC.blue }}>{r.id}</span> },
    { key: 'market', label: 'Mercado',
      render: r => <span style={{ fontSize: 15 }}>{r.market}</span> },
    { key: 'stage', label: 'Etapa',
      render: r => <span style={{ color: RC.fg }}>{r.stage}</span> },
    { key: 'age', label: 'Antigüedad',
      render: r => <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: RC.fg2 }}>{r.age}</span> },
    { key: 'priority', label: 'Prioridad', hideOnMobile: true,
      render: r => <Badge type={r.priority === 'high' ? 'danger' : r.priority === 'normal' ? 'info' : 'neutral'}>{r.priority === 'high' ? 'Alta' : r.priority === 'normal' ? 'Normal' : 'Baja'}</Badge> },
  ];

  const padding = breakpoint === 'mobile' ? 12 : 16;

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding, background: RC.bg, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <KPIRow breakpoint={breakpoint} items={[
        { label: 'En cola',        value: '38',     delta: '5 nuevas hoy',   deltaUp: false },
        { label: 'Aprobadas (7d)', value: '24',     delta: '63% conversión', deltaUp: true,  accent: RC.green },
        { label: 'Tiempo medio',   value: '2.3d',   delta: '0.4d más rápido',deltaUp: true },
        { label: 'Bloqueadas',     value: '6',      delta: '3 por KYC',      deltaUp: false, accent: RC.red },
      ]} />

      <Card
        title="Cola de inbound"
        accent="#F8FAFF"
        action={<Badge type="info">5 nuevas</Badge>}
        padding={12}
      >
        <ResponsiveTable columns={cols} rows={queue} breakpoint={breakpoint}
          getRowAccent={r => r.priority === 'high' ? RC.red : r.priority === 'normal' ? RC.blue : RC.fg3} />
      </Card>
    </div>
  );
}

// ─── COMPLIANCE ───────────────────────────────────────────────────────
function ComplianceScreenR({ breakpoint }) {
  const reviews = [
    { sku: 'NIK-AM270-42', name: 'Zapatillas Nike Air Max 270',   category: 'Ropa', flag: 'Imagen no autorizada',     market: '🇨🇱', status: 'pending'  },
    { sku: 'PHA-VIT-X90',  name: 'Suplemento Vitamina C 90 caps', category: 'Salud',flag: 'Requiere registro INVIMA',  market: '🇨🇴', status: 'blocked'  },
    { sku: 'SAM-TV55-4K',  name: 'Smart TV 55" 4K UHD',           category: 'Tech', flag: 'Garantía no documentada',   market: '🇵🇪', status: 'pending'  },
    { sku: 'FRA-PER-100',  name: 'Perfume importado 100ml',       category: 'Beauty',flag: 'Aforo aduanero pendiente', market: '🇨🇱', status: 'review'   },
  ];

  const cols = [
    { key: 'name', label: 'Producto', primary: true,
      render: r => <span>{r.name}</span>,
      trailing: r => <Badge type={r.status === 'blocked' ? 'danger' : r.status === 'pending' ? 'warning' : 'info'}>{r.status === 'blocked' ? 'Bloqueado' : r.status === 'pending' ? 'Pendiente' : 'Revisión'}</Badge> },
    { key: 'sku', label: 'SKU', hideOnMobile: true,
      render: r => <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: RC.fg3 }}>{r.sku}</span> },
    { key: 'category', label: 'Categoría', hideOnMobile: true,
      render: r => <span style={{ color: RC.fg2 }}>{r.category}</span> },
    { key: 'flag', label: 'Motivo',
      render: r => <span style={{ color: RC.fg, fontSize: 12 }}>{r.flag}</span> },
    { key: 'market', label: 'Mercado',
      render: r => <span style={{ fontSize: 15 }}>{r.market}</span> },
    { key: 'status', label: 'Estado', hideOnMobile: true,
      render: r => <Badge type={r.status === 'blocked' ? 'danger' : r.status === 'pending' ? 'warning' : 'info'}>{r.status === 'blocked' ? 'Bloqueado' : r.status === 'pending' ? 'Pendiente' : 'Revisión'}</Badge> },
  ];

  const padding = breakpoint === 'mobile' ? 12 : 16;
  return (
    <div style={{ flex: 1, overflowY: 'auto', padding, background: RC.bg, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <KPIRow breakpoint={breakpoint} items={[
        { label: 'Productos en revisión', value: '142',   delta: '18 hoy',          deltaUp: false },
        { label: 'Bloqueados',            value: '34',    delta: '8 críticos',      deltaUp: false, accent: RC.red },
        { label: 'Aprobados (7d)',        value: '482',   delta: '94% tasa',        deltaUp: true,  accent: RC.green },
        { label: 'Tiempo medio review',   value: '1.8d',  delta: 'vs 2.1d objetivo',deltaUp: true },
      ]} />

      <Card title="Productos pendientes de revisión" padding={12}>
        <ResponsiveTable columns={cols} rows={reviews} breakpoint={breakpoint}
          getRowAccent={r => r.status === 'blocked' ? RC.red : r.status === 'pending' ? RC.orange : RC.blue} />
      </Card>
    </div>
  );
}

// ─── SUPPORT ──────────────────────────────────────────────────────────
function SupportScreenR({ breakpoint }) {
  const tickets = [
    { id: 'TKT-9412', seller: 'MV Store',          subject: 'No puede publicar — error 422',    sla: '00:42', priority: 'high', agent: 'P. García' },
    { id: 'TKT-9413', seller: 'TiendaPE Online',   subject: 'Pedidos no se sincronizan',         sla: '02:15', priority: 'high', agent: 'A. Valdés' },
    { id: 'TKT-9414', seller: 'ColShop Co.',       subject: 'Cambio de información bancaria',    sla: '4h',    priority: 'normal', agent: 'R. Lagos' },
    { id: 'TKT-9415', seller: 'ModaChile SA',      subject: 'Reporte mensual no llega por mail', sla: '1d',    priority: 'low',  agent: '—' },
    { id: 'TKT-9416', seller: 'TechImport Perú',   subject: 'Producto bloqueado por compliance', sla: '6h',    priority: 'high', agent: 'J. Morales' },
  ];

  const cols = [
    { key: 'subject', label: 'Asunto', primary: true,
      render: r => <span>{r.subject}</span>,
      trailing: r => <Badge type={r.priority === 'high' ? 'danger' : r.priority === 'normal' ? 'info' : 'neutral'}>{r.priority === 'high' ? 'P1' : r.priority === 'normal' ? 'P2' : 'P3'}</Badge> },
    { key: 'id', label: 'Ticket', hideOnMobile: true,
      render: r => <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: RC.blue }}>{r.id}</span> },
    { key: 'seller', label: 'Seller',
      render: r => <span style={{ fontWeight: 500, color: RC.fg2 }}>{r.seller}</span> },
    { key: 'sla', label: 'SLA',
      render: r => <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: r.sla.includes(':') ? RC.red : RC.fg2, fontWeight: 600 }}>{r.sla}</span> },
    { key: 'agent', label: 'Agente', hideOnMobile: true,
      render: r => <span style={{ color: RC.fg2, fontSize: 12 }}>{r.agent}</span> },
  ];

  const padding = breakpoint === 'mobile' ? 12 : 16;
  return (
    <div style={{ flex: 1, overflowY: 'auto', padding, background: RC.bg, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <KPIRow breakpoint={breakpoint} items={[
        { label: 'Tickets abiertos',  value: '127',  delta: '14 críticos',    deltaUp: false, accent: RC.red },
        { label: 'P1 hoy',            value: '8',    delta: '3 en SLA riesgo',deltaUp: false, accent: RC.orange },
        { label: 'Resueltos hoy',     value: '64',   delta: '12% más vs ayer',deltaUp: true,  accent: RC.green },
        { label: 'Tiempo medio',      value: '3h12', delta: 'vs 4h objetivo', deltaUp: true },
      ]} />

      <Card title="Cola de tickets — P1 / P2" padding={12} accent="#FFF8F8"
        action={<Badge type="danger">8 P1</Badge>}>
        <ResponsiveTable columns={cols} rows={tickets} breakpoint={breakpoint}
          getRowAccent={r => r.priority === 'high' ? RC.red : r.priority === 'normal' ? RC.blue : RC.fg3} />
      </Card>
    </div>
  );
}

// ─── PERFORMANCE / LOYALTY ────────────────────────────────────────────
function PerformanceScreenR({ breakpoint }) {
  const tiers = [
    { tier: 'Diamante', count: 142,  pct: 3,  color: RC.blue,   reqs: 'GMV >$500K · SLA >98%' },
    { tier: 'Oro',      count: 482,  pct: 10, color: RC.yellow, reqs: 'GMV >$100K · SLA >95%' },
    { tier: 'Plata',    count: 1284, pct: 27, color: '#9E9E9E', reqs: 'GMV >$30K · SLA >92%'  },
    { tier: 'Bronce',   count: 2913, pct: 60, color: RC.orange, reqs: 'Activación completa'    },
  ];

  const top = [
    { rank: 1, name: 'MV Store',       market: '🇨🇱', gmv: '$4.2M',  growth: '+18%', tier: 'Diamante' },
    { rank: 2, name: 'TiendaPE Online',market: '🇵🇪', gmv: 'S/890K', growth: '+12%', tier: 'Oro'      },
    { rank: 3, name: 'ColShop Co.',    market: '🇨🇴', gmv: '$1.1M',  growth: '+24%', tier: 'Oro'      },
    { rank: 4, name: 'ModaChile SA',   market: '🇨🇱', gmv: '$620K',  growth: '+8%',  tier: 'Plata'    },
    { rank: 5, name: 'HomeDecor Cali', market: '🇨🇴', gmv: '$290K',  growth: '+34%', tier: 'Plata'    },
  ];

  const isMobile = breakpoint === 'mobile';
  const isDesktop = breakpoint === 'desktop';
  const padding = isMobile ? 12 : 16;

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding, background: RC.bg, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <KPIRow breakpoint={breakpoint} items={[
        { label: 'Sellers en programa', value: '4,821', delta: '38 esta sem', deltaUp: true },
        { label: 'GMV programa',        value: '$28.4M',delta: '18.2% MoM',   deltaUp: true,  accent: RC.green },
        { label: 'Promociones activas', value: '12',    delta: '4 este mes',  deltaUp: true },
        { label: 'NPS Seller',          value: '62',    delta: '+5 vs Q ant', deltaUp: true,  accent: RC.green },
      ]} />

      <div style={{ display: isDesktop ? 'flex' : 'block', gap: 14 }}>
        <div style={{ flex: 1, marginBottom: isDesktop ? 0 : 12 }}>
          <Card title="Distribución por tier">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {tiers.map(t => (
                <div key={t.tier}>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 5 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 8, height: 8, borderRadius: 2, background: t.color }} />
                      <span style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontSize: 13, color: RC.fg, letterSpacing: '-0.02em' }}>{t.tier}</span>
                      <span style={{ fontSize: 11, color: RC.fg3 }}>· {t.reqs}</span>
                    </span>
                    <span style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 800, fontSize: 14, color: RC.fg, letterSpacing: '-0.02em' }}>{t.count.toLocaleString()}</span>
                  </div>
                  <div style={{ height: 6, background: RC.bg, borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ width: `${t.pct}%`, height: '100%', background: t.color }} />
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div style={{ flex: 1 }}>
          <Card title="Top 5 sellers (GMV mes actual)" padding={0}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {top.map((s, i) => (
                <div key={s.rank} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderBottom: i < top.length - 1 ? `1px solid ${RC.border}` : 'none' }}>
                  <div style={{ width: 22, fontFamily: 'Montserrat, sans-serif', fontWeight: 800, fontSize: 14, color: RC.fg3 }}>#{s.rank}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: RC.fg, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.name}</div>
                    <div style={{ fontSize: 11, color: RC.fg3 }}>{s.market} · {s.tier}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 800, fontSize: 13, color: RC.fg, letterSpacing: '-0.02em' }}>{s.gmv}</div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: RC.green }}>{s.growth}</div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ─── ANALYTICS ────────────────────────────────────────────────────────
function AnalyticsScreenR({ breakpoint }) {
  const months = ['Oct','Nov','Dic','Ene','Feb','Mar','Abr'];
  const vals   = [2.1, 2.8, 3.4, 2.9, 3.6, 3.9, 4.2];
  const maxV   = Math.max(...vals);
  const bars = [
    { label: 'Chile',    value: 52, color: RC.green },
    { label: 'Perú',     value: 31, color: RC.blue  },
    { label: 'Colombia', value: 17, color: RC.orange },
  ];
  const max = Math.max(...bars.map(b => b.value));

  const isMobile = breakpoint === 'mobile';
  const isDesktop = breakpoint === 'desktop';
  const padding = isMobile ? 12 : 16;

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding, background: RC.bg, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <KPIRow breakpoint={breakpoint} items={[
        { label: 'Ingresos totales',   value: '$12.8M',  delta: '18.2% trim',  deltaUp: true,  accent: RC.green },
        { label: 'Unidades vendidas',  value: '8,420',   delta: '5.3% trim',   deltaUp: true },
        { label: 'Ticket promedio',    value: '$52.400', delta: '2.1% mes',    deltaUp: false },
        { label: 'Conversión',         value: '3.4%',    delta: '0.4 vs obj',  deltaUp: true,  accent: RC.green },
      ]} />

      <div style={{ display: isDesktop ? 'flex' : 'block', gap: 14 }}>
        <div style={{ flex: 1, marginBottom: isDesktop ? 0 : 12 }}>
          <Card title="Ventas por mercado">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {bars.map(b => (
                <div key={b.label} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 70, fontSize: 12, fontWeight: 500, color: RC.fg2 }}>{b.label}</div>
                  <div style={{ flex: 1, height: 8, background: RC.bg, borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ width: `${(b.value / max) * 100}%`, height: '100%', background: b.color }} />
                  </div>
                  <div style={{ width: 36, fontFamily: 'Montserrat, sans-serif', fontWeight: 800, fontSize: 13, color: RC.fg, textAlign: 'right', letterSpacing: '-0.02em' }}>{b.value}%</div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div style={{ flex: 1.5 }}>
          <Card title="Tendencia de ventas (M USD)">
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 120 }}>
              {vals.map((v, i) => (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
                  <div style={{
                    width: '100%', height: `${(v / maxV) * 100}px`,
                    background: i === vals.length - 1 ? RC.green : RC.greenL,
                    borderRadius: '5px 5px 0 0',
                  }} />
                  <span style={{ fontSize: 10, color: RC.fg3 }}>{months[i]}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ─── COMMS / MARKETING ────────────────────────────────────────────────
function CommsScreenR({ breakpoint }) {
  const campaigns = [
    { id: 'CMP-220', name: 'Activación Q2 — Sellers nuevos',     channel: 'Email',  audience: '1,420 sellers', status: 'success', open: '42%', click: '11%' },
    { id: 'CMP-221', name: 'Recordatorio doc. compliance',        channel: 'Push',   audience: '342 sellers',   status: 'success', open: '88%', click: '34%' },
    { id: 'CMP-222', name: 'Webinar — Cómo usar Centro de Ayuda', channel: 'Email',  audience: '4,821 sellers', status: 'pending', open: '—',   click: '—'   },
    { id: 'CMP-223', name: 'Promo Hot Sale — Pro tier',           channel: 'In-app', audience: '1,204 sellers', status: 'warning', open: '64%', click: '8%'  },
  ];

  const cols = [
    { key: 'name', label: 'Campaña', primary: true,
      render: r => <span>{r.name}</span>,
      trailing: r => <Badge type={r.status === 'pending' ? 'info' : r.status === 'warning' ? 'warning' : 'success'}>{r.status === 'pending' ? 'Programada' : r.status === 'warning' ? 'En curso' : 'Enviada'}</Badge> },
    { key: 'id', label: 'ID', hideOnMobile: true,
      render: r => <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: RC.blue }}>{r.id}</span> },
    { key: 'channel', label: 'Canal',
      render: r => <Badge type="neutral">{r.channel}</Badge> },
    { key: 'audience', label: 'Audiencia',
      render: r => <span style={{ color: RC.fg2 }}>{r.audience}</span> },
    { key: 'open', label: 'Open rate',
      render: r => <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, fontWeight: 600, color: r.open === '—' ? RC.fg3 : parseFloat(r.open) > 50 ? RC.green : RC.orange }}>{r.open}</span> },
    { key: 'click', label: 'Click rate', hideOnMobile: true,
      render: r => <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: RC.fg2 }}>{r.click}</span> },
  ];

  const padding = breakpoint === 'mobile' ? 12 : 16;
  return (
    <div style={{ flex: 1, overflowY: 'auto', padding, background: RC.bg, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <KPIRow breakpoint={breakpoint} items={[
        { label: 'Campañas activas',   value: '12',    delta: '4 este mes',     deltaUp: true },
        { label: 'Open rate medio',    value: '54.2%', delta: 'vs 48% objetivo',deltaUp: true,  accent: RC.green },
        { label: 'Click rate medio',   value: '14.8%', delta: '2.1% vs sem',    deltaUp: true },
        { label: 'Audiencia total',    value: '4,821', delta: '38 nuevos',      deltaUp: true },
      ]} />

      <Card title="Campañas — últimos 30 días" padding={12}>
        <ResponsiveTable columns={cols} rows={campaigns} breakpoint={breakpoint}
          getRowAccent={r => r.status === 'pending' ? RC.blue : r.status === 'warning' ? RC.orange : RC.green} />
      </Card>
    </div>
  );
}

// ─── SETTINGS ─────────────────────────────────────────────────────────
function SettingsScreenR({ breakpoint }) {
  const fields = [
    ['Equipo',          'Seller Experience'],
    ['Email corporativo','ana.valdes@falabella.com'],
    ['Rol',              'Lead PM · Internal Tools'],
    ['Mercado primario', 'Chile'],
  ];
  const padding = breakpoint === 'mobile' ? 12 : 16;
  return (
    <div style={{ flex: 1, overflowY: 'auto', padding, background: RC.bg, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ maxWidth: 560, width: '100%' }}>
        <Card title="Información de la cuenta">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {fields.map(([label, val]) => (
              <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: RC.fg2, fontFamily: 'Inter, sans-serif', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</label>
                <input defaultValue={val} style={{
                  fontFamily: 'Inter, sans-serif', fontSize: 13, padding: '9px 12px',
                  border: `1px solid ${RC.border}`, borderRadius: 6,
                  color: RC.fg, outline: 'none', background: RC.surface,
                }}
                onFocus={e => e.target.style.borderColor = RC.green}
                onBlur={e => e.target.style.borderColor = RC.border}
                />
              </div>
            ))}
          </div>
          <button style={{ marginTop: 16, fontFamily: 'Inter, sans-serif', fontSize: 13, fontWeight: 600, background: RC.green, color: '#fff', border: 'none', borderRadius: 6, padding: '9px 20px', cursor: 'pointer' }}>Guardar cambios</button>
        </Card>
      </div>

      <div style={{ maxWidth: 560, width: '100%' }}>
        <Card title="Notificaciones">
          {['Nuevas escalaciones','Tickets P1 asignados','Cambios SLA','Reportes semanales'].map((item, i, arr) => (
            <div key={item} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 0', borderBottom: i < arr.length - 1 ? `1px solid ${RC.border}` : 'none' }}>
              <span style={{ fontSize: 13, color: RC.fg2 }}>{item}</span>
              <div style={{ width: 38, height: 22, background: i % 2 === 0 ? RC.green : '#D0D0D0', borderRadius: 11, position: 'relative', cursor: 'pointer', flexShrink: 0, transition: 'background 0.15s' }}>
                <div style={{ position: 'absolute', top: 2, left: i % 2 === 0 ? 18 : 2, width: 18, height: 18, background: '#fff', borderRadius: '50%', boxShadow: '0 1px 3px rgba(0,0,0,0.2)', transition: 'left 0.15s' }} />
              </div>
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}

const SCREEN_MAP_R = {
  overview:    OverviewScreenR,
  journey:     SellersScreenR,
  inbound:     InboundScreenR,
  compliance:  ComplianceScreenR,
  support:     SupportScreenR,
  performance: PerformanceScreenR,
  loyalty:     PerformanceScreenR,
  analytics:   AnalyticsScreenR,
  comms:       CommsScreenR,
  settings:    SettingsScreenR,
};

const META_R = {
  overview:    { title: 'Overview',          subtitle: 'Vista general · Seller Experience' },
  journey:     { title: 'Seller Journey',    subtitle: 'Onboarding · Activación · Retención' },
  inbound:     { title: 'Inbound',           subtitle: 'Cola de solicitudes · KYC · Compliance' },
  compliance:  { title: 'Compliance',        subtitle: 'Revisión de productos · Bloqueos' },
  support:     { title: 'Soporte al seller', subtitle: 'Tickets · SLA · Escalaciones' },
  performance: { title: 'Performance',       subtitle: 'GMV · Conversión · Métricas' },
  loyalty:     { title: 'Loyalty',           subtitle: 'Tiers · Programas · NPS' },
  analytics:   { title: 'Analytics',         subtitle: 'Reportes · BI · Dashboards' },
  comms:       { title: 'Comms & Marketing', subtitle: 'Campañas · Comunicación con sellers' },
  settings:    { title: 'Configuración',     subtitle: 'Cuenta · Preferencias' },
};

Object.assign(window, { SCREEN_MAP_R, META_R });
