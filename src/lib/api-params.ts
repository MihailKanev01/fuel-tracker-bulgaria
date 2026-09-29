export function parseNumberParam(
  value: string | null,
  fallback: number | null = null,
) {
  if (value == null || value.trim() === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function parseIntegerParam(
  value: string | null,
  fallback: number,
  min: number,
  max: number,
) {
  if (value == null || value.trim() === "") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}
