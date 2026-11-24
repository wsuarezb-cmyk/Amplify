from backend.services.user_service import get_display_names_by_email


class UserDirectoryFakeBQ:
    def __init__(self):
        self.queries = []

    def full_table_id(self, name):
        return f"project.dataset.{name}"

    def query(self, sql, params=None, timeout_s=None):
        self.queries.append((sql, params, timeout_s))
        return [{"normalized_email": "ana@falabella.com", "full_name": "Ana María"}]


def test_get_display_names_uses_parameterized_email_array_and_normalizes_keys():
    bq = UserDirectoryFakeBQ()

    result = get_display_names_by_email(
        bq, [" Ana@Falabella.com ", "ana@falabella.com", "other@falabella.com"],
    )

    sql, params, timeout_s = bq.queries[0]
    assert result == {"ana@falabella.com": "Ana María"}
    assert "IN UNNEST(@emails)" in sql
    assert params[0].values == ["ana@falabella.com", "other@falabella.com"]
    assert timeout_s == 30


def test_get_display_names_skips_query_for_empty_recipient_list():
    bq = UserDirectoryFakeBQ()

    assert get_display_names_by_email(bq, [" "]) == {}
    assert bq.queries == []