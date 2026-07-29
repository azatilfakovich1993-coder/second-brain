import { embedNote } from "../llm/embeddings.js";
import { classifyNote } from "./classify.js";
import { recognizeSpeech } from "../speech/yandex.js";
import { insertNote, searchSimilar, getUserTimezone } from "../db/supabase.js";

// Measured against real Russian phrases on the HF-hosted MiniLM model: a
// genuinely related note scored 0.77, unrelated ones stayed at 0.16-0.31 —
// much better separation than the earlier local e5-small model gave, so
// 0.55 leaves a wide safety margin either way. Revisit with real usage data.
const SIMILARITY_THRESHOLD = 0.55;

function formatDue(dueAt, timezone) {
  if (!dueAt) return null;
  return new Date(dueAt).toLocaleString("ru-RU", {
    timeZone: timezone,
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const TYPE_LABEL = { task: "Задача", idea: "Идея", note: "Заметка" };

// Confirmed live: a bare "да" sent as a reply to the bot's own message got
// classified as its own empty note ("нет информации для заметки") — the
// pipeline has no conversation memory, so a short acknowledgement has no
// content to attach to. Rather than build full conversation-history
// tracking (a bigger feature), just refuse to file these as notes at all.
const FILLER_WORDS = new Set([
  "да", "нет", "ок", "окей", "хорошо", "ладно", "угу", "ага", "неа",
  "ясно", "понял", "поняла", "спасибо", "пожалуйста", "привет", "ну", "давай",
]);

function isJustFiller(text) {
  const words = text
    .toLowerCase()
    .replace(/[.,!?;:]/g, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return words.length > 0 && words.length <= 3 && words.every((w) => FILLER_WORDS.has(w));
}

/**
 * Handles one incoming Telegram message (voice or text) end-to-end:
 * transcribe (if voice) -> classify -> embed -> store -> find related past
 * notes -> return a short reply string for the bot to send back.
 *
 * @param {object} env
 * @param {object} input
 * @param {number} input.telegramUserId
 * @param {string} [input.text] - present for text messages
 * @param {Buffer} [input.voiceBuffer] - present for voice messages (OGG/Opus)
 */
export async function processIncomingMessage(env, { telegramUserId, text, voiceBuffer }) {
  const rawText = voiceBuffer ? await recognizeSpeech(env, voiceBuffer) : text;
  if (!rawText?.trim()) {
    return { reply: "Не расслышал, можешь повторить?" };
  }

  if (isJustFiller(rawText)) {
    return { reply: "Не понял, о чём речь — можешь сформулировать мысль целиком?" };
  }

  const timezone = await getUserTimezone(env, telegramUserId);
  const { type, dueAt, text: cleanText } = await classifyNote(env.GIGACHAT_AUTH_KEY, rawText, timezone);
  console.log(`classified "${rawText}" ->`, { type, dueAt, cleanText }); // deliberately kept in prod — date-parsing bugs have twice been invisible without this
  const embedding = await embedNote(env, cleanText);

  const note = await insertNote(env, { telegramUserId, text: cleanText, type, embedding, dueAt });

  let related = [];
  try {
    const matches = await searchSimilar(env, telegramUserId, embedding, 4);
    related = matches.filter((m) => m.id !== note.id && m.similarity >= SIMILARITY_THRESHOLD);
  } catch (err) {
    // Semantic search is a nice-to-have, not critical — don't fail the whole
    // note-taking flow if it errors (e.g. embedding dimension mismatch).
    console.error("searchSimilar failed:", err.message);
  }

  const lines = [`${TYPE_LABEL[type]}: ${cleanText}`];
  if (dueAt) lines.push(`Напомню: ${formatDue(dueAt, timezone)}`);
  if (related.length > 0) {
    lines.push("", "Похоже на то, что ты уже говорил:");
    for (const r of related) lines.push(`— ${r.text}`);
  }

  return { reply: lines.join("\n"), note, related };
}
