import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import { Api } from "telegram";
import { logger } from "../lib/logger.js";

export interface AutoReplyRule {
  id: string;
  trigger: string;
  response: string;
  matchType: "contains" | "exact" | "startsWith";
  enabled: boolean;
}

export interface AutoReplyResult {
  checked: number;
  matched: number;
  replied: number;
  errors: string[];
}

const TG_APP_ID = parseInt(process.env.TELEGRAM_API_ID || "2040");
const TG_APP_HASH = process.env.TELEGRAM_API_HASH || "";

function matchesRule(text: string, rule: AutoReplyRule): boolean {
  const t = text.toLowerCase().trim();
  const trigger = rule.trigger.toLowerCase().trim();
  switch (rule.matchType) {
    case "exact": return t === trigger;
    case "startsWith": return t.startsWith(trigger);
    case "contains":
    default: return t.includes(trigger);
  }
}

export async function checkAndAutoReply(
  sessionString: string,
  rules: AutoReplyRule[],
  limitDialogs: number = 10,
  limitMessages: number = 20,
): Promise<AutoReplyResult> {
  const result: AutoReplyResult = { checked: 0, matched: 0, replied: 0, errors: [] };
  const activeRules = rules.filter((r) => r.enabled);
  if (activeRules.length === 0) return result;

  const client = new TelegramClient(
    new StringSession(sessionString),
    TG_APP_ID,
    TG_APP_HASH,
    { connectionRetries: 3 }
  );

  try {
    await client.connect();

    // Fetch recent dialogs (private chats only)
    const dialogs = await client.getDialogs({ limit: limitDialogs });
    for (const dialog of dialogs) {
      if (!dialog.isUser) continue; // only private messages
      try {
        const msgs = await client.getMessages(dialog.entity, { limit: limitMessages });
        for (const msg of msgs) {
          if (!msg.text || msg.out) continue; // skip outgoing
          result.checked++;
          for (const rule of activeRules) {
            if (matchesRule(msg.text, rule)) {
              result.matched++;
              try {
                await client.sendMessage(dialog.entity!, { message: rule.response });
                result.replied++;
                logger.info(`Auto-reply sent to ${dialog.name}: trigger="${rule.trigger}"`);
              } catch (err: any) {
                result.errors.push(`Reply failed: ${err?.message ?? String(err)}`);
              }
              break; // one reply per message
            }
          }
        }
      } catch (_e) { /* skip failed dialog */ }
    }
  } finally {
    try { await client.disconnect(); } catch (_) {}
  }

  return result;
}
