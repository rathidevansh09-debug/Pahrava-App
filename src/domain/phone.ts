/** Strip spaces, dashes, brackets and a leading +91 / 91 / 0 from an Indian mobile number. */
export function normalizePhone(input: string): string {
  let d = (input || '').replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  else if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return d;
}

/** Valid 10-digit Indian mobile number (starts 6–9). */
export function isValidIndianMobile(input: string): boolean {
  return /^[6-9]\d{9}$/.test(normalizePhone(input));
}

/** 98765 43210 */
export function formatPhone(input: string): string {
  const d = normalizePhone(input);
  return d.length === 10 ? `${d.slice(0, 5)} ${d.slice(5)}` : input;
}
