import { embedNote } from "../llm/embeddings.js";
import { classifyNote } from "./classify.js";
import { recognizeSpeech } from "../speech/yandex.js";
import { insertNote, searchSimilar } from "../db/supabase.js";

// multilingual-e5-small produces a compressed similarity range for short
// Russian phrases (measured: truly related notes ~0.86-0.90, unrelated
// notes still cluster at ~0.79-0.83) — 0.85 was picked from that real
// measurement, not guessed. Revisit once there's enough real usage data.
const SIMILARITY_THRESHOLD = 0.85;

function formatDue(dueAt) {
  if (!dueAt) return null;
  return new Date(dueAt).toLocaleString("ru-RU", {
    timeZone: "Europe/Moscow",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const TYPE_LABEL = { task: "Задача", idea: "Идея", note: "Заметка" };

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

  const { type, dueAt, text: cleanText } = await classifyNote(env.GIGACHAT_AUTH_KEY, rawText);
  const embedding = await embedNote(cleanText);

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
  if (dueAt) lines.push(`Напомню: ${formatDue(dueAt)}`);
  if (related.length > 0) {
    lines.push("", "Похоже на то, что ты уже говорил:");
    for (const r of related) lines.push(`— ${r.text}`);
  }

  return { reply: lines.join("\n"), note, related };
}
