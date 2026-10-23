"""
Fixtures compartidas. Los tests NO tocan BigQuery: FakeBQ reemplaza al
BigQueryConnector registrando cada llamada y devolviendo respuestas en cola.

Correr desde la raíz del proyecto:
    backend\\.venv\\Scripts\\python -m pytest backend/tests
"""

import pytest


class FakeBQ:
    """Doble de BigQueryConnector: query() devuelve las respuestas en el orden encolado."""

    def __init__(self, responses: list[list[dict]] | None = None) -> None:
        self.responses = list(responses or [])
        self.queries: list[tuple[str, list]] = []
        self.updates: list[dict] = []
        self.inserts: list[tuple[str, list[dict]]] = []
        self.insert_schemas: list[list | None] = []
        self.dml_queries: list[tuple[str, list]] = []
        self.dml_result = 1

    def full_table_id(self, name: str) -> str:
        return f"proj.ds.{name}"

    def query(self, sql, params=None, timeout_s=None):
        self.queries.append((sql, params or []))
        return self.responses.pop(0) if self.responses else []

    def update_row(self, table_id, set_clause, where_clause, params):
        self.updates.append({
            "table_id": table_id, "set": set_clause, "where": where_clause, "params": params,
        })

    def insert_rows_dml(self, table_id, rows, schema=None):
        self.inserts.append((table_id, rows))
        self.insert_schemas.append(schema)

    def execute_dml(self, sql, params=None):
        self.dml_queries.append((sql, params or []))
        return self.dml_result


def param_values(params: list, name: str):
    """Valor de un Scalar/ArrayQueryParameter por nombre (None si no existe)."""
    for p in params:
        if p.name == name:
            return getattr(p, "values", None) if hasattr(p, "values") else p.value
    return None


@pytest.fixture
def fake_bq():
    return FakeBQ()
