/** Normalize Ghana local or partial international input to E.164 (+233…). */
export function normalizeGhanaPhoneToE164(raw: string): string {
  let formatted = (raw || '').trim().replace(/\s+/g, '');
  if (!formatted) return '';
  if (formatted.startsWith('+')) return formatted;
  if (formatted.startsWith('0')) return '+233' + formatted.substring(1);
  if (formatted.startsWith('233')) return '+' + formatted;
  return '+233' + formatted;
}

export function isValidGhanaE164(e164: string): boolean {
  return /^\+233[0-9]{9}$/.test(e164);
}
