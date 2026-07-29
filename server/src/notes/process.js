import { embedNote } from "../llm/embeddings.js";
import { classifyNote, getStartOfDayIso, extractDueDateFromReply } from "./classify.js";
import { recognizeSpeech } from "../speech/yandex.js";
import {
  insertNote,
  searchSimilar,
  getUserTimezone,
  getRecentTurns,
  addConversationTurn,
  getNotesSince,
  getTasks,
  getFeed,
  getPendingNoteId,
  setPendingNoteId,
  updateNoteDueDate,
} from "../db/supabase.js";

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

/**
 * "Какие у меня заметки за сегодня?" etc. — the model can't know what's
 * actually stored, so KIND=query only tells us WHAT to look up; the actual
 * answer comes from a real database read, not a guess (confirmed live: for
 * this exact phrase, without this branch the model invented a bogus note
 * with a fake reminder attached instead of admitting it doesn't know).
 */
async function buildQueryReply(env, telegramUserId, scope, timezone) {
  if (scope === "tasks") {
    const tasks = await getTasks(env, telegramUserId);
    if (tasks.length === 0) return "Активных задач нет.";
    return ["Твои задачи:", ...tasks.map((t) => `— ${t.text}${t.due_at ? ` (${formatDue(t.due_at, timezone)})` : ""}`)].join("\n");
  }

  if (scope === "today") {
    const notesToday = await getNotesSince(env, telegramUserId, getStartOfDayIso(timezone));
    if (notesToday.length === 0) return "Сегодня пока ничего не сохранено.";
    return ["Сегодня:", ...notesToday.map((n) => `— ${TYPE_LABEL[n.type] ?? n.type}: ${n.text}`)].join("\n");
  }

  const feed = await getFeed(env, telegramUserId, 10);
  if (feed.length === 0) return "Пока нет ни одной заметки.";
  return ["Последнее сохранённое:", ...feed.map((n) => `— ${TYPE_LABEL[n.type] ?? n.type}: ${n.text}`)].join("\n");
}

/**
 * Handles one incoming Telegram message (voice or text) end-to-end:
 * transcribe (if voice) -> classify (with recent conversation history, so
 * a short follow-up like "да" or "какую?" is recognized as a reply rather
 * than filed as its own garbage note — confirmed live that without history
 * these produced nonsense like "Заметка: непонятно, о чём идёт речь") ->
 * store (for real notes) -> find related past notes -> reply.
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

  const [timezone, history, pendingNoteId] = await Promise.all([
    getUserTimezone(env, telegramUserId),
    getRecentTurns(env, telegramUserId, 6),
    getPendingNoteId(env, telegramUserId),
  ]);

  // If we just asked "Когда напомнить?" about a task, try reading this
  // message as the answer first — a focused single-question prompt is far
  // more reliable than folding "is this a due-date answer" into the bigger
  // note/reply/query decision. If it genuinely isn't a time (e.g. the user
  // ignored the question and said something else), fall through below
  // instead of losing their message.
  if (pendingNoteId) {
    const resolvedDueAt = await extractDueDateFromReply(env.GIGACHAT_AUTH_KEY, rawText, timezone);
    await setPendingNoteId(env, telegramUserId, null);
    if (resolvedDueAt) {
      await updateNoteDueDate(env, pendingNoteId, resolvedDueAt);
      const reply = `Хорошо, напомню: ${formatDue(resolvedDueAt, timezone)}`;
      await addConversationTurn(env, telegramUserId, "user", rawText);
      await addConversationTurn(env, telegramUserId, "assistant", reply);
      return { reply };
    }
  }

  const result = await classifyNote(env.GIGACHAT_AUTH_KEY, rawText, timezone, history);
  console.log(`classified "${rawText}" ->`, result); // deliberately kept in prod — date-parsing bugs have twice been invisible without this

  await addConversationTurn(env, telegramUserId, "user", rawText);

  if (result.kind === "reply") {
    await addConversationTurn(env, telegramUserId, "assistant", result.answer);
    return { reply: result.answer };
  }

  if (result.kind === "query") {
    const queryReply = await buildQueryReply(env, telegramUserId, result.scope, timezone);
    await addConversationTurn(env, telegramUserId, "assistant", queryReply);
    return { reply: queryReply };
  }

  const { type, dueAt, text: cleanText } = result;
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
  if (dueAt) {
    lines.push(`Напомню: ${formatDue(dueAt, timezone)}`);
  } else if (type === "task") {
    // A task with no due date silently never gets a reminder — ask instead
    // of leaving the user to notice that on their own (confirmed live:
    // "надо не забыть маме позвонить" got filed with no follow-up at all).
    await setPendingNoteId(env, telegramUserId, note.id);
    lines.push("Когда напомнить? (например «завтра в 10», «через час», или напиши «без напоминания»)");
  }
  if (related.length > 0) {
    lines.push("", "Похоже на то, что ты уже говорил:");
    for (const r of related) lines.push(`— ${r.text}`);
  }
  const replyText = lines.join("\n");

  await addConversationTurn(env, telegramUserId, "assistant", replyText);

  return { reply: replyText, note, related };
}
