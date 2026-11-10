export function number(value) {
  return new Intl.NumberFormat('es-CL').format(Number(value ?? 0));
}

export function percentage(value) {
  return value == null ? '—' : `${value > 0 ? '+' : ''}${Number(value).toFixed(1)}%`;
}

export function Metric({ label, value, strong = false, alert = false, icon: Icon, detail, action }) {
  return (
    <div className={`trace-metric${strong ? ' trace-metric--strong' : ''}${alert ? ' trace-metric--alert' : ''}${Icon ? ' trace-metric--audience' : ''}`}>
      <div className="trace-metric-heading">
        {Icon && <span className="trace-metric-icon"><Icon aria-hidden="true" /></span>}
        <span>{label}</span>
      </div>
      <strong>{number(value)}</strong>
      {detail && <small>{detail}</small>}
      {alert && <em>Alerta · ≥20%</em>}
      {action && <div className="trace-metric-action">{action}</div>}
    </div>
  );
}
