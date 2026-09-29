/**
 * ComoFuncionaSaaca — secciones fijas del Glosario (constants/glosarioContenido.js).
 */

import ChartCard from '../reporteria/ChartCard.jsx';
import { ResultChip } from '../calibracion/ComparacionReveal.jsx';
import { SECCIONES_SAACA } from '../../constants/glosarioContenido.js';

const textoStyle = {
  fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
  color: 'var(--color-fg)', lineHeight: 1.6, margin: 0,
};

const filaStyle = {
  display: 'flex', gap: 12, alignItems: 'flex-start',
  padding: '10px 0', borderTop: '1px solid var(--color-gray-100)',
};

const tipoStyle = {
  flexShrink: 0, minWidth: 150, fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)',
  fontWeight: 'var(--font-weight-bold)', color: 'var(--color-gray-700)', paddingTop: 2,
};

function Pasos({ pasos }) {
  return (
    <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
      {pasos.map((p, i) => (
        <li key={p.titulo} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <span style={{
            flexShrink: 0, width: 24, height: 24, borderRadius: 'var(--radius-full)',
            background: 'var(--color-primary-light)', color: 'var(--color-primary-dark)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', fontWeight: 'var(--font-weight-bold)',
          }}>
            {i + 1}
          </span>
          <div>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
              fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-black)' }}>
              {p.titulo}
            </div>
            <p style={{ ...textoStyle, color: 'var(--color-fg-muted)' }}>{p.texto}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

export default function ComoFuncionaSaaca() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {SECCIONES_SAACA.map(s => (
        <ChartCard key={s.id} title={s.titulo} subtitle={s.subtitulo}>
          <div style={{ padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {s.pasos && <Pasos pasos={s.pasos} />}

            {s.resultados && (
              <div>
                {s.resultados.map(r => (
                  <div key={r.resultado} style={filaStyle}>
                    <span style={{ ...tipoStyle, minWidth: 110 }}><ResultChip resultado={r.resultado} /></span>
                    <p style={textoStyle}>{r.texto}</p>
                  </div>
                ))}
              </div>
            )}

            {s.tipos && (
              <div>
                {s.tipos.map(t => (
                  <div key={t.tipo} style={filaStyle}>
                    <span style={tipoStyle}>{t.tipo}</span>
                    <p style={textoStyle}>{t.texto}</p>
                  </div>
                ))}
              </div>
            )}

            {s.parrafos?.map(p => <p key={p.slice(0, 40)} style={textoStyle}>{p}</p>)}
          </div>
        </ChartCard>
      ))}
    </div>
  );
}
