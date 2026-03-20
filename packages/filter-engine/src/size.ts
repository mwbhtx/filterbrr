/**
 * Parse a size string like "30GB" → 30, "1.5TB" → 1536, "512MB" → 0.5.
 * Plain numeric strings are treated as bytes and converted to GB.
 * Empty/whitespace-only strings return 0.
 */
export function parseSizeStr(s: string): number {
  const trimmed = s.trim().toUpperCase();
  if (trimmed === '') return 0;
  if (trimmed.endsWith('GB')) return parseFloat(trimmed.slice(0, -2));
  if (trimmed.endsWith('TB')) return parseFloat(trimmed.slice(0, -2)) * 1024;
  if (trimmed.endsWith('MB')) return parseFloat(trimmed.slice(0, -2)) / 1024;
  // Plain number — treat as bytes, convert to GB
  const val = parseFloat(trimmed);
  if (isNaN(val)) return 0;
  return val / 1e9;
}
