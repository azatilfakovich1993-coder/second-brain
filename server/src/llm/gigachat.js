import https from "node:https";
import { randomUUID } from "node:crypto";

/**
 * GigaChat (Sber) client — plain REST over Node's https module (no SDK).
 *
 * IMPORTANT: verify auth flow and endpoint against your current
 * developers.sber.ru account before relying on this in production;
 * Sber has changed scopes/endpoints before.
 *
 * Known gotcha: Sber's TLS chain uses a Russian government root CA that
 * Node doesn't trust by default, so plain `fetch()` fails with
 * UNABLE_TO_VERIFY_LEAF_SIGNATURE. `rejectUnauthorized: false` below is the
 * common pilot-script workaround — installing the "Минцифры" root
 * certificate properly is the safer long-term fix for production use.
 */
const AUTH_HOST = "ngw.devices.sberbank.ru";
const AUTH_PORT = 9443;
const AUTH_PATH = "/api/v2/oauth";
const API_HOST = "gigachat.devices.sberbank.ru";
const API_PORT = 443;
const CHAT_PATH = "/api/v1/chat/completions";
const EMBEDDINGS_PATH = "/api/v1/embeddings";

function request({ host, port, path, method, headers, body }) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      { host, port, path, method, headers, rejectUnauthorized: false },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          if (res.statusCode < 200 || res.statusCode >= 300) {
            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
            return;
          }
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(e);
          }
        });
      }
    );
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

let cachedToken = null;
let cachedTokenExpiresAt = 0;

async function getAccessToken(authKey) {
  if (cachedToken && Date.now() < cachedTokenExpiresAt - 30_000) {
    return cachedToken;
  }

  const body = "scope=GIGACHAT_API_PERS";
  const data = await request({
    host: AUTH_HOST,
    port: AUTH_PORT,
    path: AUTH_PATH,
    method: "POST",
    headers: {
      Authorization: `Basic ${authKey}`,
      RqUID: randomUUID(),
      "Content-Type": "application/x-www-form-urlencoded",
      "Content-Length": Buffer.byteLength(body),
    },
    body,
  });

  cachedToken = data.access_token;
  cachedTokenExpiresAt = data.expires_at ?? Date.now() + 25 * 60 * 1000;
  return cachedToken;
}

/**
 * @param {object} opts
 * @param {string} opts.authKey - Base64 "Authorization key" from developers.sber.ru
 * @param {Array<{role: 'system'|'user'|'assistant', content: string}>} opts.messages
 * @param {number} [opts.temperature]
 */
export async function chat({ authKey, messages, temperature = 0.7 }) {
  const token = await getAccessToken(authKey);
  const body = JSON.stringify({ model: "GigaChat", messages, temperature });

  const data = await request({
    host: API_HOST,
    port: API_PORT,
    path: CHAT_PATH,
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(body),
    },
    body,
  });

  return data.choices?.[0]?.message?.content ?? "";
}

/**
 * Vector embedding for a piece of text.
 *
 * UNUSED — kept for reference only. Confirmed by an actual live request
 * that this endpoint returns 402 Payment Required on the free personal
 * (GIGACHAT_API_PERS) tier, so the app uses a self-hosted open-source model
 * instead — see src/llm/embeddings.js.
 *
 * @param {string} authKey
 * @param {string} text
 * @returns {Promise<number[]>}
 */
export async function embed(authKey, text) {
  const token = await getAccessToken(authKey);
  const body = JSON.stringify({ model: "Embeddings", input: [text] });

  const data = await request({
    host: API_HOST,
    port: API_PORT,
    path: EMBEDDINGS_PATH,
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(body),
    },
    body,
  });

  return data.data?.[0]?.embedding ?? [];
}
