export function fmtTime(ms: number) {
  return new Date(ms).toISOString().replace('T', ' ').slice(0, 23);
}

/** Normalize payload text for compact plain-text display. */
function normalizePlainPayload(payloadDisplay: string): string {
  try {
    // Valid JSON should be shown as compact one-line text in plain mode.
    return JSON.stringify(JSON.parse(payloadDisplay));
  } catch {
    // Non-JSON payloads keep content but collapse formatting whitespace.
    return payloadDisplay.replace(/\s+/g, ' ').trim();
  }
}

export function formatPayloadForDisplay(
  payloadDisplay: string,
  mode: 'plain' | 'json'
): string {
  if (mode === 'plain') return normalizePlainPayload(payloadDisplay);
  try {
    return JSON.stringify(JSON.parse(payloadDisplay), null, 2);
  } catch {
    return payloadDisplay;
  }
}
