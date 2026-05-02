/** Single-line label for pharmacy pickers (name + optional location + phone). */
export function formatPharmacyPickerLabel(p: {
  name: string;
  location?: string | null;
  phone?: string | null;
}): string {
  const parts = [p.name.trim()];
  const loc = p.location?.trim();
  const ph = p.phone?.trim();
  if (loc) parts.push(loc);
  if (ph) parts.push(ph);
  return parts.join(' — ');
}
