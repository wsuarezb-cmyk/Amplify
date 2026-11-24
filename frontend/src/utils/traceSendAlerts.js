const EMAIL_RE = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/u;

export function addTraceAlertRecipients(current, text, maxRecipients = 20) {
  const entries = String(text ?? '').split(/[,;\n]+/u).map(value => value.trim()).filter(Boolean);
  const invalid = entries.some(email => !EMAIL_RE.test(email));
  const currentKeys = new Set(current.map(email => email.toLowerCase()));
  const additions = entries.filter(email => {
    const key = email.toLowerCase();
    if (!EMAIL_RE.test(email) || currentKeys.has(key)) return false;
    currentKeys.add(key);
    return true;
  });

  if (current.length + additions.length > maxRecipients) {
    return { recipients: current, error: `Puedes agregar hasta ${maxRecipients} destinatarios.` };
  }

  return {
    recipients: [...current, ...additions],
    error: invalid ? 'Revisa los correos ingresados.' : '',
  };
}