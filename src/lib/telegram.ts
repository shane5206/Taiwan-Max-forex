import { fetchJson, HttpError } from "./http.js";
import { log } from "./logger.js";

interface TelegramConfig {
  botToken: string;
  chatId: string;
}

export function getTelegramConfig(): TelegramConfig | null {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!botToken || !chatId) return null;
  return { botToken, chatId };
}

/** Send a Telegram HTML message. Returns true on success. Never throws. */
export async function sendTelegram(html: string, cfg = getTelegramConfig()): Promise<boolean> {
  if (!cfg) {
    log.warn("telegram.skip", { reason: "TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID missing" });
    return false;
  }
  const url = `https://api.telegram.org/bot${cfg.botToken}/sendMessage`;
  const body = new URLSearchParams({
    chat_id: cfg.chatId,
    parse_mode: "HTML",
    disable_web_page_preview: "true",
    text: html.slice(0, 4096),
  });

  try {
    await fetchJson(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      timeoutMs: 8_000,
      retries: 2,
    });
    return true;
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 0;
    log.error("telegram.fail", { status, err: String(err) });
    return false;
  }
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
