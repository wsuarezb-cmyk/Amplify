"""
Prompt y schema de salida del diagnóstico.

La IA solo redacta: recibe el contexto cuantitativo ya calculado (contexto.py)
y ejemplos reales de evaluaciones (muestras.py), y devuelve la narrativa en un
schema estricto. Las tablas del reporte las genera render.py por código.

Versionar PROMPT_VERSION ante cualquier cambio de instrucciones o schema: queda
registrado junto a cada diagnóstico para poder comparar calidad entre versiones.
"""

import json
from typing import Literal

from pydantic import BaseModel

PROMPT_VERSION = "diag-v2"

# Límites de cada lista: se piden en el prompt y se aplican en código (acotar()),
# no en el schema (el modo estricto del gateway no garantiza maxItems).
LIMITES = {
    "resumen_ejecutivo": 5, "hallazgos": 5, "reconocimientos": 4,
    "oportunidades": 5, "plan_accion": 6,
}


class Hallazgo(BaseModel):
    titulo: str
    descripcion: str
    evidencia: str                 # cifra del contexto o patrón en las observaciones
    causa_probable: str
    casos_ejemplo: list[str]       # numero_caso tomados de las evaluaciones de ejemplo


class Reconocimiento(BaseModel):
    titulo: str
    descripcion: str
    evidencia: str


class Oportunidad(BaseModel):
    titulo: str
    descripcion: str
    criterio_o_proceso: str
    impacto: Literal["ALTO", "MEDIO", "BAJO"]
    frecuencia: Literal["ALTA", "MEDIA", "BAJA"]


class Accion(BaseModel):
    accion: str
    criterio_o_proceso: str
    indicador: str                 # qué métrica del tablero mide el avance
    meta: str
    plazo: str
    responsable: Literal["AGENTE", "LIDER", "CALIDAD"]


class DiagnosticoIA(BaseModel):
    # La valoración general NO es de la IA: la calcula el código con el semáforo
    # del tablero (contexto["valoracion"]).
    resumen_ejecutivo: list[str]
    comentario_indicadores: str
    comentario_clusters: str
    comentario_criterios: str
    hallazgos: list[Hallazgo]
    reconocimientos: list[Reconocimiento]
    oportunidades: list[Oportunidad]
    plan_accion: list[Accion]
    conclusiones: str


_TONO = {
    "PERSONA": (
        "El diagnóstico es FEEDBACK 1:1 para un agente. Háblale en segunda persona (tú), con tono "
        "constructivo y específico. Compara su desempeño con su equipo y con la operación. "
        "Reconoce lo que hace bien antes de las oportunidades."
    ),
    "EQUIPO": (
        "El diagnóstico es para un LÍDER sobre su equipo. Identifica patrones del equipo, compara "
        "agentes solo cuando aporte (sin exponer ni culpar), y propone acciones de coaching y de proceso."
    ),
    "GENERAL": (
        "El diagnóstico es OPERATIVO para líderes de Calidad y operaciones. Enfócate en países, "
        "equipos, tipos de interacción y procesos con mayor impacto, y en acciones de proceso."
    ),
}

SYSTEM_INSTRUCTION = """
Eres un analista senior de calidad de atención para el equipo de Seller Experience de Falabella
Marketplace. Redactas diagnósticos ejecutivos de calidad a partir de evaluaciones automáticas de
SAACA (evaluador de IA con criterios definidos por Calidad).

Cómo leer los indicadores:
- Calidad ponderada (más es mejor): en cada interacción se promedian sus criterios evaluados
  (CUMPLE = 100, NO_CUMPLE = 0) según el peso de cada criterio; N/A y NO_EVALUADO no cuentan. El
  indicador es el promedio de las interacciones. Semáforo: 90% o más Bueno, 85% a 90% Regular,
  menos de 85% Crítico.
- La calidad ponderada de un tipo de interacción depende de cuántos criterios se le evalúan
  (criterios_evaluados): con pocos criterios cada interacción queda cerca de 0% o 100%, así que esos
  valores son más extremos y no se comparan directamente con tipos de muchos criterios. Explícalos
  con el cumplimiento de sus criterios.
- % Defectuosas (menos es mejor): interacciones con al menos un criterio crítico en NO_CUMPLE. Basta
  una falla crítica, por eso puede ser alto aunque la calidad ponderada sea buena.
- Accuracy por categoría ECU, ECN, ECC y no crítico (más es mejor): interacciones sin ningún
  NO_CUMPLE en los criterios de esa categoría.
- % Cumplimiento de un criterio (más es mejor): CUMPLE / (CUMPLE + NO_CUMPLE).
- Referencias: "operación" es el mismo período sin otros filtros; "equipo" es el equipo del agente.
  Una diferencia menor a 2 puntos porcentuales frente a la referencia está en línea con ella.
- La valoración general ya viene calculada con el semáforo: tu texto debe ser coherente con ella.

Evaluaciones de ejemplo: se eligen al azar con más NO_CUMPLE que lo real para ilustrar cómo se ven
las fallas. No indican frecuencia ni gravedad: la frecuencia y la prioridad salen solo de los indicadores.

Reglas:
- Usa ÚNICAMENTE los datos entregados. No inventes cifras, casos ni causas sin evidencia.
- Toda cifra que menciones debe existir tal cual en los datos. No calcules cifras nuevas.
- Nombra los indicadores como arriba (p. ej. "Calidad ponderada", "% Defectuosas", "% cumplimiento de
  C0003"), nunca con nombres de campos del JSON.
- En casos_ejemplo usa solo numero_caso que aparezcan en las evaluaciones de ejemplo.
- Cada hallazgo: qué pasa → evidencia → causa probable.
- Prioriza oportunidades por impacto (criterios críticos, volumen) y frecuencia.
- El plan de acción es SMART: acción concreta, indicador que la mide, meta, plazo y responsable
  (AGENTE, LIDER o CALIDAD).
- Frases cortas y concretas, sin relleno. Nunca menciones correos. Español neutro.
""".strip()


def construir_user_prompt(contexto: dict, muestras: list[dict]) -> str:
    alcance = contexto["alcance"]
    cantidades = (
        f"resumen_ejecutivo: 3 a {LIMITES['resumen_ejecutivo']} puntos; "
        f"hallazgos: 3 a {LIMITES['hallazgos']}; reconocimientos: 2 a {LIMITES['reconocimientos']}; "
        f"oportunidades: 3 a {LIMITES['oportunidades']}; plan_accion: 3 a {LIMITES['plan_accion']} acciones."
    )
    return "\n\n".join([
        f"## Alcance\nTipo: {alcance['tipo']} — {alcance['etiqueta']}\n{_TONO[alcance['tipo']]}\n"
        f"Valoración general (semáforo de calidad ponderada): {contexto['valoracion']}",
        "## Datos del período (JSON, calculados con las fórmulas del tablero)\n"
        + json.dumps(contexto, ensure_ascii=False, separators=(",", ":")),
        f"## Evaluaciones de ejemplo con la observación de SAACA ({len(muestras)}, al azar)\n"
        + json.dumps(muestras, ensure_ascii=False, separators=(",", ":")),
        "## Tarea\nRedacta el diagnóstico en el formato de salida indicado. " + cantidades,
    ])


def acotar(diag: DiagnosticoIA, casos_validos: set[str]) -> DiagnosticoIA:
    """Aplica los límites de cada lista y descarta casos que no vienen de los ejemplos."""
    datos = diag.model_dump()
    for campo, n in LIMITES.items():
        datos[campo] = datos[campo][:n]
    for h in datos["hallazgos"]:
        h["casos_ejemplo"] = [c for c in h["casos_ejemplo"] if c in casos_validos][:5]
    return DiagnosticoIA.model_validate(datos)
