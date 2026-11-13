import {
  Bar, BarChart, CartesianGrid, LabelList, Line, LineChart, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from 'recharts';
import ChartCard from '../reporteria/ChartCard.jsx';

const COLORS = {
  dark: '#283618', olive: '#606C38', amber: '#FFB703', yellow: '#FFE066', cream: '#FEFAE0',
};
const COUNTRY_LABELS = { CL_Sellers: 'Chile', PE_Sellers: 'Perú', CO_Sellers: 'Colombia' };
const number = value => new Intl.NumberFormat('es-CL').format(Number(value ?? 0));
const rate = (value, total) => total ? (value * 100 / total) : 0;
const pct = value => `${Number(value ?? 0).toLocaleString('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
const pctOrDash = (value, total) => total ? pct(rate(value, total)) : '—';

function DeliveryResult({ summary }) {
  const processed = summary.sellers_processed ?? 0;
  const sent = summary.sellers_sent ?? 0;
  const notSent = summary.sellers_not_sent ?? 0;
  const sentShare = rate(sent, processed);
  const notSentShare = rate(notSent, processed);

  return (
    <ChartCard title="Resultado del envío" subtitle="Sellers únicos · 100% del universo procesado">
      {!processed ? <p className="trace-send-report-empty">Sin sellers para comparar.</p> : <div className="trace-send-delivery">
        <div className="trace-send-delivery-bar" role="img" aria-label={`${number(sent)} enviados (${pct(sentShare)}), ${number(notSent)} no enviados (${pct(notSentShare)})`}>
          {sent > 0 && <span className="trace-send-delivery-sent" style={{ width: `${sentShare}%` }}>{sentShare >= 12 ? pct(sentShare) : ''}</span>}
          {notSent > 0 && <span className="trace-send-delivery-not-sent" style={{ width: `${notSentShare}%` }}>{notSentShare >= 15 ? pct(notSentShare) : ''}</span>}
        </div>
        <div className="trace-send-delivery-legend">
          <div><i className="trace-send-swatch trace-send-swatch--sent" /><span>Sellers enviados</span><strong>{number(sent)} · {pct(sentShare)}</strong></div>
          <div><i className="trace-send-swatch trace-send-swatch--not-sent" /><span>Sellers no enviados</span><strong>{number(notSent)} · {pct(notSentShare)}</strong></div>
        </div>
      </div>}
    </ChartCard>
  );
}

function InteractionFunnel({ summary }) {
  const sent = summary.sellers_sent ?? 0;
  const opened = summary.sellers_with_open ?? 0;
  const clicked = summary.sellers_with_click ?? 0;
  const stages = [
    { name: 'Sellers enviados', count: sent, share: sent ? 100 : 0, color: COLORS.dark },
    { name: 'Sellers con apertura', count: opened, share: rate(opened, sent), color: COLORS.amber },
    { name: 'Sellers con clic', count: clicked, share: rate(clicked, sent), color: COLORS.olive },
  ];

  return (
    <ChartCard title="Interacción" subtitle="Apertura y clic como porcentaje de sellers enviados">
      {!sent ? <p className="trace-send-report-empty">Sin sellers enviados para medir interacción.</p> : <div className="trace-send-interaction">
        {stages.map((stage, index) => <div className="trace-send-funnel-stage" key={stage.name}>
          <div className="trace-send-funnel-label"><strong>{stage.name}</strong><span>{number(stage.count)} · {pct(stage.share)}</span></div>
          <div className="trace-send-funnel-track"><span style={{ width: `${stage.share}%`, background: stage.color }} /></div>
          {index < stages.length - 1 && <span className="trace-send-funnel-arrow" aria-hidden="true">↓</span>}
        </div>)}
        {opened > 0 && <p className="trace-send-ctor">CTOR · {pct(rate(clicked, opened))}</p>}
      </div>}
    </ChartCard>
  );
}

function CauseTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return <div className="trace-send-chart-tooltip"><strong>{row.cause}</strong><span>{number(row.sellers)} sellers únicos</span><span>{number(row.contacts)} contactos afectados</span></div>;
}

function CauseReport({ causes }) {
  const data = (causes ?? []).map(row => ({ ...row, cause: row.cause || 'Sin causa' }));
  return (
    <ChartCard title="Causas de no envío" subtitle="Sellers únicos afectados · un seller puede presentar más de una causa entre sus contactos">
      {!data.length ? <p className="trace-send-report-empty">No hay contactos no enviados.</p> : <div className="trace-send-cause-chart">
        <ResponsiveContainer width="100%" height={Math.max(180, data.length * 38)}>
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 38, bottom: 4, left: 10 }}>
            <CartesianGrid horizontal={false} stroke={COLORS.cream} />
            <XAxis type="number" allowDecimals={false} hide />
            <YAxis type="category" dataKey="cause" width={155} tick={{ fill: COLORS.dark, fontSize: 11 }} />
            <Tooltip content={<CauseTooltip />} cursor={{ fill: COLORS.cream }} />
            <Bar dataKey="sellers" fill={COLORS.olive} radius={[0, 3, 3, 0]}>
              <LabelList dataKey="sellers" position="right" fill={COLORS.dark} fontSize={11} formatter={number} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>}
    </ChartCard>
  );
}

function CountryMetric({ value, total, color }) {
  const share = rate(value, total);
  return <div className="trace-send-country-metric">
    <div><span style={{ width: `${share}%`, background: color }} /></div><strong>{pctOrDash(value, total)}</strong>
  </div>;
}

function CountryPerformance({ countries }) {
  if (countries.length <= 1) return null;
  return (
    <ChartCard title="Desempeño por país" subtitle="Sellers únicos dentro de cada país">
      <div className="trace-send-country-table-wrap"><table className="trace-send-country-table">
        <thead><tr><th>País</th><th>Enviados</th><th>No enviados</th><th>Apertura</th><th>Clic</th></tr></thead>
        <tbody>{countries.map(row => <tr key={row.country}>
          <th scope="row">{COUNTRY_LABELS[row.country] ?? row.country}</th>
          <td><CountryMetric value={row.sellers_sent} total={row.sellers_processed} color={COLORS.dark} /></td>
          <td><CountryMetric value={row.sellers_not_sent} total={row.sellers_processed} color={COLORS.yellow} /></td>
          <td><CountryMetric value={row.sellers_with_open} total={row.sellers_sent} color={COLORS.amber} /></td>
          <td><CountryMetric value={row.sellers_with_click} total={row.sellers_sent} color={COLORS.olive} /></td>
        </tr>)}</tbody>
      </table></div>
    </ChartCard>
  );
}

function DailyTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return <div className="trace-send-chart-tooltip">
    <strong>{label}</strong>
    <span>Sellers procesados: {number(row.sellers_processed)}</span>
    <span>Enviados: {number(row.sellers_sent)} ({pctOrDash(row.sellers_sent, row.sellers_processed)})</span>
    <span>Apertura: {number(row.sellers_with_open)} ({pctOrDash(row.sellers_with_open, row.sellers_sent)})</span>
    <span>Clic: {number(row.sellers_with_click)} ({pctOrDash(row.sellers_with_click, row.sellers_sent)})</span>
  </div>;
}

function DailyPerformance({ rows }) {
  if (!rows?.length) return null;
  const data = rows.map(row => ({
    ...row,
    sent_rate: row.sellers_processed ? rate(row.sellers_sent, row.sellers_processed) : null,
    open_rate: row.sellers_sent ? rate(row.sellers_with_open, row.sellers_sent) : null,
    click_rate: row.sellers_sent ? rate(row.sellers_with_click, row.sellers_sent) : null,
  }));
  return (
    <ChartCard title="Evolución diaria" subtitle="Porcentaje de sellers por fecha">
      <div className="trace-send-daily-chart">
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={data} margin={{ top: 12, right: 20, bottom: 8, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={COLORS.cream} />
            <XAxis dataKey="date" tick={{ fill: COLORS.dark, fontSize: 10 }} />
            <YAxis domain={[0, 100]} unit="%" tick={{ fill: COLORS.dark, fontSize: 10 }} />
            <Tooltip content={<DailyTooltip />} />
            <Line type="monotone" dataKey="sent_rate" name="Enviados" stroke={COLORS.dark} strokeWidth={2} dot={{ r: 3 }} />
            <Line type="monotone" dataKey="open_rate" name="Apertura" stroke={COLORS.amber} strokeWidth={2} dot={{ r: 3 }} />
            <Line type="monotone" dataKey="click_rate" name="Clic" stroke={COLORS.olive} strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}

export default function TraceSendReporting({ report }) {
  const summary = report.summary ?? {};
  const countries = report.country_performance ?? [];
  const dailyRows = report.daily_performance ?? [];
  return (
    <section className="trace-send-reporting">
      <div className="trace-section-heading"><div><span className="trace-step">03</span><h2>Reportería</h2></div></div>
      <div className="trace-send-reporting-grid">
        <DeliveryResult summary={summary} />
        <InteractionFunnel summary={summary} />
        <CauseReport causes={report.not_sent_causes} />
        <CountryPerformance countries={countries} />
        <DailyPerformance rows={dailyRows} />
      </div>
    </section>
  );
}