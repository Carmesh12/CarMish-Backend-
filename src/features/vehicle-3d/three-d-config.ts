export function isThreeDMockMode(): boolean {
  return process.env.THREE_D_MOCK_MODE?.trim().toLowerCase() === 'true';
}

export function threeDMockMaxModelBytes(): number {
  const raw = process.env.THREE_D_MOCK_MAX_MODEL_BYTES?.trim();
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return 100 * 1024 * 1024;
}
