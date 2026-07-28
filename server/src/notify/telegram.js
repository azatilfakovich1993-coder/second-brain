import crypto from "node:crypto";

/** Thin wrapper over the Telegram Bot API — sending messages and reading updates. */
const API = (token) => `https://api.telegram.org/bot${token}`;

/**
 * Verifies a Telegram Mini App's `initData` string per Telegram's documented
 * check (HMAC-SHA256 keyed with a hash of the bot token) and returns the
 * parsed Telegram user, or null if the signature doesn't match — e.g. a
 * forged request not actually coming from Telegram.
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
export function validateInitData(env, initData) {
  if (!initData) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;
  params.delete("hash");

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secretKey = crypto.createHmac("sha256", "WebAppData").update(env.TELEGRAM_BOT_TOKEN).digest();
  const computedHash = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

  if (computedHash !== hash) return null;
  try {
    return JSON.parse(params.get("user") ?? "null");
  } catch {
    return null;
  }
}

export async function sendMessage(env, chatId, text, extra = {}) {
  const res = await fetch(`${API(env.TELEGRAM_BOT_TOKEN)}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, ...extra }),
  });
  if (!res.ok) {
    console.error("Telegram sendMessage failed:", await res.text());
  }
  return res.json();
}

/** Downloads a Telegram-hosted file (e.g. a voice message) as a Buffer. */
export async function downloadFile(env, fileId) {
  const fileInfoRes = await fetch(`${API(env.TELEGRAM_BOT_TOKEN)}/getFile?file_id=${fileId}`);
  const fileInfo = await fileInfoRes.json();
  const filePath = fileInfo.result?.file_path;
  if (!filePath) throw new Error(`Could not resolve Telegram file path for ${fileId}`);

  const fileRes = await fetch(`https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${filePath}`);
  const arrayBuffer = await fileRes.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export async function setWebhook(env) {
  const url = `${env.PUBLIC_URL}/telegram/webhook`;
  const res = await fetch(`${API(env.TELEGRAM_BOT_TOKEN)}/setWebhook?url=${encodeURIComponent(url)}`);
  return res.json();
}
