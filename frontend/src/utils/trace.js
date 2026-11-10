export function parseTraceIdentifiers(input, { preserveSpaces = false } = {}) {
  const separator = preserveSpaces ? /[,;\n\r\t]+/u : /[\s,;]+/u;
  const received = String(input ?? '').split(separator)
    .map(value => preserveSpaces ? value.trim().replace(/\s+/gu, ' ') : value)
    .filter(Boolean);
  const unique = [...new Set(received)];

  return {
    received: received.length,
    validUnique: unique.length,
    invalid: [],
    duplicates: received.length - unique.length,
    identifiers: unique,
  };
}