import type { ParseResult } from './parser.js';
import { mqttTopicMatch } from './topic-match.js';

export type RuleRow = {
  id: number;
  sort_order: number;
  name: string;
  enabled: number;
  topic_pattern: string;
  payload_regex: string | null;
  reply_topic: string;
  reply_payload_template: string;
};

export function applyTemplate(
  template: string,
  ctx: { topic: string; payloadDisplay: string; parse: ParseResult }
): string {
  let parsedStr = '';
  if (ctx.parse.ok) {
    const v = ctx.parse.value;
    parsedStr = typeof v === 'string' ? v : JSON.stringify(v);
  } else {
    parsedStr = ctx.parse.error;
  }
  return template
    .replaceAll('{{topic}}', ctx.topic)
    .replaceAll('{{payload}}', ctx.payloadDisplay)
    .replaceAll('{{parsed}}', parsedStr);
}

export function ruleMatches(
  rule: RuleRow,
  topic: string,
  payloadDisplay: string
): boolean {
  if (!rule.enabled) return false;
  if (!mqttTopicMatch(rule.topic_pattern, topic)) return false;
  if (rule.payload_regex) {
    try {
      const re = new RegExp(rule.payload_regex);
      if (!re.test(payloadDisplay)) return false;
    } catch {
      return false;
    }
  }
  return true;
}
