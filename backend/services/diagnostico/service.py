"""
DiagnosticoService — orquesta el flujo; no contiene reglas de negocio propias
(cada paso vive en su módulo: filtros, contexto, muestras, prompt, render,
repositorio).

  cuota → filtros → contexto (extracto cacheado) → muestras (BQ) → IA → HTML → registro

El diagnóstico no se almacena: se devuelve para descargar en el momento.
"""

import logging
import time
from datetime import datetime, timezone
from typing import Callable, Optional

from backend.connectors.bigquery_connector import BigQueryConnector
from backend.connectors.genai_connector import GenAIConnector
from backend.services.diagnostico import filtros as F
from backend.services.diagnostico.contexto import construir_contexto
from backend.services.diagnostico.muestras import obtener_muestras
from backend.services.diagnostico.prompt import (
    PROMPT_VERSION, SYSTEM_INSTRUCTION, DiagnosticoIA, acotar, construir_user_prompt,
)
from backend.services.diagnostico.render import render_html
from backend.services.diagnostico.repositorio import RepositorioDiagnosticos
from backend.services.pitch_reporting_service import PitchReportingService

logger = logging.getLogger(__name__)

# Precio de referencia (USD por millón de tokens) — mismo criterio que SAACA,
# solo para estimar costo en el registro; no es facturación.
_USD_POR_M_ENTRADA = 0.30
_USD_POR_M_SALIDA = 2.50


class FeatureNoConfigurada(RuntimeError):
    """Falta configuración (KAIROS_JWT): la feature responde 503."""


class CuotaAgotada(RuntimeError):
    """El usuario alcanzó su límite mensual de diagnósticos: responde 429."""


class DiagnosticoService:

    def __init__(
        self,
        bq: BigQueryConnector,
        settings,
        genai: Optional[GenAIConnector] = None,
        extracto_fn: Optional[Callable] = None,
        repositorio: Optional[RepositorioDiagnosticos] = None,
    ) -> None:
        self.bq = bq
        self.settings = settings
        self._genai = genai
        self._extracto_fn = extracto_fn or (lambda: PitchReportingService(bq).get_extracto())
        self.repositorio = repositorio or RepositorioDiagnosticos(bq)

    # ── Cuota ────────────────────────────────────────────────────────────

    def cuota(self, email: str, es_admin: bool) -> dict:
        """Estado de la cuota del mes. ADMIN no tiene límite."""
        limite = self.settings.DIAGNOSTICO_CUOTA_MENSUAL
        usados = self.repositorio.usados_en_mes(email)
        if es_admin:
            return {"limite": None, "usados": usados, "restantes": None, "ilimitada": True}
        return {"limite": limite, "usados": usados, "restantes": max(limite - usados, 0), "ilimitada": False}

    def generar_para_usuario(self, filtros: dict, email: str, es_admin: bool) -> tuple[str, dict]:
        """
        Flujo completo para un usuario: cuota → generación → registro.
          - Errores del usuario (período inválido, poco volumen): no se registran
            ni consumen cuota.
          - Fallos técnicos (IA, BQ): se registran como ERROR y no consumen cuota.
          - Si el registro del OK falla, el diagnóstico igual se entrega (se loguea).
        """
        self._conector_ia()                     # 503 antes de gastar cuota o consultas
        norm = F.normalizar(filtros)
        F.validar_periodo(norm)

        if not es_admin:
            limite = self.settings.DIAGNOSTICO_CUOTA_MENSUAL
            if self.repositorio.usados_en_mes(email) >= limite:
                raise CuotaAgotada(
                    f"Alcanzaste tu límite de {limite} diagnósticos este mes. Se renueva el día 1."
                )

        try:
            html, meta = self.generar_html(norm, usuario=email)
        except ValueError:
            raise                               # error del usuario: no se registra
        except Exception as exc:
            self._registrar_seguro(email=email, status="ERROR", norm=norm, error=f"{type(exc).__name__}: {exc}")
            raise

        self._registrar_seguro(email=email, status="OK", norm=norm, meta=meta)
        return html, meta

    def _registrar_seguro(self, **kwargs) -> None:
        try:
            self.repositorio.registrar(**kwargs)
        except Exception as exc:                # no bloquear la entrega por el registro
            logger.error("No se pudo registrar el diagnóstico (%s): %s", kwargs.get("status"), exc)

    # ── Generación ───────────────────────────────────────────────────────

    def _conector_ia(self) -> GenAIConnector:
        if self._genai is None:
            if not self.settings.KAIROS_JWT:
                raise FeatureNoConfigurada("El diagnóstico IA no está configurado (falta KAIROS_JWT).")
            self._genai = GenAIConnector.desde_settings(self.settings)
        return self._genai

    def preparar(self, filtros: dict) -> tuple[dict, dict]:
        """Filtros normalizados + contexto de datos (sin IA). Lanza ValueError si no es válido."""
        norm = F.normalizar(filtros)
        F.validar_periodo(norm)
        extracto = self._extracto_fn()
        return norm, construir_contexto(extracto.columns, extracto.data, norm)

    def generar_html(self, filtros: dict, usuario: Optional[str] = None) -> tuple[str, dict]:
        """Genera el diagnóstico completo en memoria. Retorna (html, metadatos del registro)."""
        conector = self._conector_ia()          # falla rápido si no está configurado
        t0 = time.time()
        norm, contexto = self.preparar(filtros)
        muestras = obtener_muestras(self.bq, norm)

        resultado = conector.generar(
            system=SYSTEM_INSTRUCTION,
            user=construir_user_prompt(contexto, muestras),
            schema=DiagnosticoIA,
        )
        casos_validos = {str(m.get("numero_caso")) for m in muestras if m.get("numero_caso")}
        diag = acotar(resultado.parsed, casos_validos)

        generado_en = datetime.now(timezone.utc)
        html = render_html(
            contexto, diag, n_muestras=len(muestras), modelo=conector.model,
            prompt_version=PROMPT_VERSION, generado_en=generado_en, generado_por=usuario,
        )
        meta = {
            "filtros_norm": norm,
            "filtros_hash": F.hash_filtros(norm),
            "alcance": contexto["alcance"],
            "n_interacciones": contexto["kpis"]["alcance"]["interacciones"],
            "n_muestras": len(muestras),
            "model": conector.model,
            "prompt_version": PROMPT_VERSION,
            "prompt_tokens": resultado.prompt_tokens,
            "output_tokens": resultado.output_tokens,
            "costo_estimado_usd": round(
                resultado.prompt_tokens / 1e6 * _USD_POR_M_ENTRADA
                + resultado.output_tokens / 1e6 * _USD_POR_M_SALIDA, 6),
            "duracion_s": round(time.time() - t0, 1),
            "generado_en": generado_en,
        }
        logger.info(
            "Diagnóstico generado — alcance=%s, interacciones=%d, muestras=%d, tokens=%d/%d, %.1fs",
            contexto["alcance"]["tipo"], meta["n_interacciones"], meta["n_muestras"],
            meta["prompt_tokens"], meta["output_tokens"], meta["duracion_s"],
        )
        return html, meta
