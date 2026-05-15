export function fmtTime(ms: number) {
  return new Date(ms).toISOString().replace('T', ' ').slice(0, 23);
}

/** Normalize payload text for compact plain-text display. */
function normalizePlainPayload(payloadDisplay: string): string {
  const trimmed = payloadDisplay.trim();
  // Cheap heuristic: only attempt JSON parse when the string looks JSON-like,
  // avoiding repeated throws for hex strings, plain values, etc.
  const looksLikeJson =
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'));
  if (looksLikeJson) {
    try {
      // Valid JSON should be shown as compact one-line text in plain mode.
      return JSON.stringify(JSON.parse(trimmed));
    } catch {
      // Malformed JSON-like string — fall through to whitespace collapse.
    }
  }
  // Non-JSON payloads keep content but collapse formatting whitespace.
  return trimmed.replace(/\s+/g, ' ');
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
