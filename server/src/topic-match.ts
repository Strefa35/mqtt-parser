/**
 * MQTT topic filter match (+ single-level, # multi-level remainder).
 */
export function mqttTopicMatch(filter: string, topic: string): boolean {
  const f = filter.split('/');
  const t = topic.split('/');

  for (let i = 0; i < f.length; i++) {
    const seg = f[i];
    if (seg === '#') {
      return true;
    }
    if (seg === '+') {
      if (i >= t.length) return false;
      continue;
    }
    if (i >= t.length || seg !== t[i]) {
      return false;
    }
  }

  return f.length === t.length;
}
