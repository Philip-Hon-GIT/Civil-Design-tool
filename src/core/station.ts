/**
 * Format a chainage in metres as a road station string, for example 545 -> "0+545.00".
 */
export function formatStation(metres: number, decimals = 2): string {
  if (!Number.isFinite(metres)) throw new RangeError(`Invalid station: ${metres}`);
  const sign = metres < 0 ? '-' : '';
  const abs = Math.abs(metres);
  const fixed = abs.toFixed(decimals);
  const [intPart, frac] = fixed.split('.');
  const whole = Number(intPart);
  const km = Math.floor(whole / 1000);
  const m = String(whole % 1000).padStart(3, '0');
  return `${sign}${km}+${m}${frac !== undefined ? `.${frac}` : ''}`;
}

/** Parse a station string such as "1+023.95" back to metres. */
export function parseStation(text: string): number {
  const match = /^\s*(-)?(\d+)\+(\d{3}(?:\.\d+)?)\s*$/.exec(text);
  if (!match) throw new SyntaxError(`Invalid station: "${text}"`);
  const value = Number(match[2]) * 1000 + Number(match[3]);
  return match[1] ? -value : value;
}
