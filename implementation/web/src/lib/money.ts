/** Format a minor-unit amount without converting it through JavaScript arithmetic. */
export function formatMinorAmount(amount: number | string, currency: string, exponent: number) {
  const raw = String(amount);
  if (!/^\d+$/.test(raw)) return `${currency} ${raw}`;
  const padded = raw.padStart(exponent + 1, "0");
  const major = exponent === 0 ? padded : `${padded.slice(0, -exponent)}.${padded.slice(-exponent)}`;
  return `${currency} ${major}`;
}
