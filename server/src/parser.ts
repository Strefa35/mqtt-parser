export type ParseMode = 'auto' | 'json' | 'text' | 'hex';

export type ParseResult =
  | { ok: true; mode: ParseMode; value: unknown }
  | { ok: false; mode: ParseMode; error: string };

function isMostlyPrintableUtf8(s: string): boolean {
  if (s.length === 0) return true;
  let bad = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 9 || c === 10 || c === 13) continue;
    if (c < 32 || c === 65533) bad++;
  }
  return bad / s.length < 0.05;
}

export function bufferToDisplay(buf: Buffer): { encoding: 'utf8' | 'hex'; display: string } {
  const utf8 = buf.toString('utf8');
  if (isMostlyPrintableUtf8(utf8)) {
    return { encoding: 'utf8', display: utf8 };
  }
  return { encoding: 'hex', display: buf.toString('hex') };
}

export function parsePayload(
  display: string,
  encoding: 'utf8' | 'hex',
  mode: ParseMode
): ParseResult {
  if (mode === 'hex') {
    return { ok: true, mode: 'hex', value: display };
  }
  if (mode === 'text') {
    return { ok: true, mode: 'text', value: display };
  }
  if (mode === 'json') {
    try {
      return { ok: true, mode: 'json', value: JSON.parse(display) };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false, mode: 'json', error: msg };
    }
  }
  // auto
  if (encoding === 'hex') {
    return { ok: true, mode: 'auto', value: display };
  }
  const trimmed = display.trim();
  if (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  ) {
    try {
      return { ok: true, mode: 'auto', value: JSON.parse(display) };
    } catch {
      return { ok: true, mode: 'auto', value: display };
    }
  }
  return { ok: true, mode: 'auto', value: display };
}
