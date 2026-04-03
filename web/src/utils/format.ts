export function fmtTime(ms: number) {
  return new Date(ms).toISOString().replace('T', ' ').slice(0, 23);
}

export function formatPayloadForDisplay(
  payloadDisplay: string,
  mode: 'plain' | 'json'
): string {
  if (mode === 'plain') return payloadDisplay;
  try {
    return JSON.stringify(JSON.parse(payloadDisplay), null, 2);
  } catch {
    return payloadDisplay;
  }
}
