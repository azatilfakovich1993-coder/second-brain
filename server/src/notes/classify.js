import { chat } from "../llm/gigachat.js";

const WEEKDAY_INDEX = {
  воскресенье: 0,
  понедельник: 1,
  вторник: 2,
  среда: 3,
  четверг: 4,
  пятница: 5,
  суббота: 6,
};

function pad(n) {
  return String(n).padStart(2, "0");
}

/** Start of "today" in the given timezone, as an ISO instant — for querying
 * "what did I capture today" correctly regardless of the server's own TZ. */
export function getStartOfDayIso(timezone, date = new Date()) {
  const now = getTzParts(timezone, date);
  const offset = getUtcOffset(timezone, date);
  return new Date(`${now.year}-${pad(now.month)}-${pad(now.day)}T00:00:00${offset}`).toISOString();
}

/**
 * UTC offset for an IANA zone as "+04:00" — computed live instead of a
 * fixed constant, since the user isn't always in the same zone (travels
 * between e.g. Samara/Moscow/Vladivostok) and each has a different offset.
 * Russia has had no DST since 2014, so a zone's offset is constant for any
 * given date — no seasonal edge cases to handle.
 */
function getUtcOffset(timezone, date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, timeZoneName: "longOffset" }).formatToParts(date);
  const gmt = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT+00:00";
  return gmt.replace("GMT", "") || "+00:00";
}

function getTzParts(timezone, date = new Date()) {
  const formatter = new Intl.DateTimeFormat("ru-RU", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "long",
    hour12: false,
  });
  const p = Object.fromEntries(formatter.formatToParts(date).map((x) => [x.type, x.value]));
  return {
    year: Number(p.year),
    month: Number(p.month),
    day: Number(p.day),
    hour: Number(p.hour),
    minute: Number(p.minute),
    weekday: p.weekday,
    weekdayIndex: WEEKDAY_INDEX[p.weekday],
  };
}

function addDaysInTz(timezone, nowParts, days) {
  const offset = getUtcOffset(timezone);
  const anchor = new Date(`${nowParts.year}-${pad(nowParts.month)}-${pad(nowParts.day)}T12:00:00${offset}`);
  const shifted = new Date(anchor.getTime() + days * 24 * 3600 * 1000);
  return getTzParts(timezone, shifted);
}

function buildSystemPrompt(timezone, lastAssistantTurn) {
  const now = getTzParts(timezone);
  const todayLabel = `${now.year}-${pad(now.month)}-${pad(now.day)} ${pad(now.hour)}:${pad(now.minute)} (${now.weekday})`;
  const offset = getUtcOffset(timezone);

  // Inferring "this is answering my previous question" purely from the raw
  // text of a short message like "какую?" is unreliable (confirmed live —
  // the model still filed it as a note even with history shown). Telling
  // it directly whenever the last thing *it* said ended in "?" is a much
  // stronger, structurally-known signal than hoping it re-derives that
  // from context.
  const lastWasQuestion = lastAssistantTurn?.trim().endsWith("?");

  return `Ты разбираешь сообщения пользователя в его личном "втором мозге" — приложении для голосовых заметок и напоминаний.

Сейчас у пользователя: ${todayLabel}, часовой пояс UTC${offset}.
${lastAssistantTurn ? "\nТебе показана история последних сообщений переписки — используй её, чтобы понять контекст." : ""}
${lastWasQuestion ? `\nВАЖНО: твоё последнее сообщение в истории было уточняющим вопросом ("${lastAssistantTurn.trim()}"). Новое сообщение пользователя почти наверняка отвечает именно на этот вопрос — это KIND=reply, а не новая заметка.` : ""}

СНАЧАЛА реши, что это за сообщение:
- note — самостоятельная мысль, задача, идея или заметка, которую нужно сохранить в базу.
- reply — короткий ответ/уточнение/реакция на твоё же предыдущее сообщение (например "да", "какую?", "напомни снова про это") — НЕ новая мысль для сохранения, а часть диалога.
- query — пользователь просит ПОКАЗАТЬ то, что уже сохранено (например "какие у меня заметки за сегодня", "что у меня на завтра", "покажи мои задачи") — ты НЕ знаешь, что реально сохранено, поэтому НЕ придумывай ответ и НЕ сохраняй это как заметку.

Если KIND=query — ты не отвечаешь сам, код сам найдёт данные. Укажи только область поиска:
KIND: query
SCOPE: <today|tasks|all>
(today — про сегодня, tasks — про задачи/дела, all — если неясно или просят "всё")

Если KIND=reply — ответь пользователю по существу и по-человечески, опираясь на историю переписки. Формат:
KIND: reply
ANSWER: <твой ответ одной-двумя короткими фразами>

Если KIND=note — разбери саму мысль. Если type=task, укажи WHEN_KIND и WHEN_VALUE:
- weekday — если назван день недели ("в четверг"): WHEN_VALUE = само название дня недели (например "четверг").
- relative_days — если "сегодня"/"завтра"/"послезавтра": WHEN_VALUE = число дней (0/1/2).
- relative_hours — если "через N часов" ИЛИ "через N минут": WHEN_VALUE = число часов, дробное для минут (например 0.5 для получаса, 0.05 для 3 минут). НЕ используй никакую другую категорию для минут — только relative_hours с дробным числом.
- date — если названа конкретная дата: WHEN_VALUE в формате ДД.ММ или ДД.ММ.ГГГГ.
- none — если срок не назван вовсе.

TIME — конкретное время суток, если названо (формат ЧЧ:ММ), иначе "none". Для relative_hours всегда "none".

Формат для KIND=note — ВСЕГДА все строки:
KIND: note
TYPE: <task|idea|note>
WHEN_KIND: <weekday|relative_days|relative_hours|date|none>
WHEN_VALUE: <значение или none>
TIME: <ЧЧ:ММ или none>
TEXT: <краткая очищенная формулировка заметки, без "надо не забыть" и т.п. — сама суть>

Не пытайся сам вычислять итоговую дату — просто извлеки, ЧТО сказал пользователь, дату посчитает код.

ВАЖНО: никогда не останавливайся после одной строки KIND — всегда дописывай все строки формата для выбранного варианта (для reply — обязательно строку ANSWER, для query — обязательно SCOPE, для note — все поля).`;
}

function extractField(raw, name) {
  const match = raw.match(new RegExp(`${name}\\s*[:=]\\s*(\\S.*)`, "i"));
  return match ? match[1].trim() : null;
}

function resolveDueDate(timezone, { whenKind, whenValue, time }) {
  if (!whenKind || whenKind === "none") return null;

  // The model inconsistently wraps the number in extra text — seen live as
  // a trailing "(5 минут)" — and there's no guarantee the number is always
  // the first token, so search anywhere in the string instead of anchoring
  // to the start (an earlier ^-anchored version still failed on a later
  // real message).
  const leadingNumber = (str) => {
    const match = str?.match(/-?\d+(\.\d+)?/);
    return match ? parseFloat(match[0]) : NaN;
  };

  if (whenKind === "relative_hours") {
    const hours = leadingNumber(whenValue);
    if (!Number.isFinite(hours)) return null;
    return new Date(Date.now() + hours * 3600 * 1000).toISOString();
  }

  // The model doesn't reliably stick to the enum in the prompt — confirmed
  // live it invented "relative_minutes" for "через 3 минуты" instead of the
  // instructed relative_hours-as-a-fraction, silently dropping the
  // reminder. Handle the variant defensively rather than trust the prompt
  // to never drift again.
  if (whenKind === "relative_minutes") {
    const minutes = leadingNumber(whenValue);
    if (!Number.isFinite(minutes)) return null;
    return new Date(Date.now() + minutes * 60 * 1000).toISOString();
  }

  const now = getTzParts(timezone);
  let target;

  if (whenKind === "relative_days") {
    const days = leadingNumber(whenValue);
    if (!Number.isFinite(days)) return null;
    target = addDaysInTz(timezone, now, days);
  } else if (whenKind === "weekday") {
    const targetDow = WEEKDAY_INDEX[whenValue?.toLowerCase()];
    if (targetDow === undefined) return null;
    const diff = (targetDow - now.weekdayIndex + 7) % 7;
    target = addDaysInTz(timezone, now, diff);
  } else if (whenKind === "date") {
    const m = whenValue?.match(/^(\d{1,2})\.(\d{1,2})(?:\.(\d{4}))?$/);
    if (!m) return null;
    target = { day: Number(m[1]), month: Number(m[2]), year: m[3] ? Number(m[3]) : now.year };
  } else {
    return null;
  }

  const timeMatch = time?.match(/^(\d{1,2}):(\d{2})$/);
  const [hh, mm] = timeMatch ? [Number(timeMatch[1]), Number(timeMatch[2])] : [9, 0];
  const offset = getUtcOffset(timezone);
  const iso = `${target.year}-${pad(target.month)}-${pad(target.day)}T${pad(hh)}:${pad(mm)}:00${offset}`;
  return new Date(iso).toISOString();
}

function parse(timezone, raw, originalText) {
  const kind = extractField(raw, "KIND")?.toLowerCase();

  if (kind === "reply") {
    const answerMatch = raw.match(/ANSWER\s*[:=]\s*([\s\S]+)/i);
    return {
      kind: "reply",
      answer: answerMatch ? answerMatch[1].trim().split("\n")[0] : "Не совсем понял — можешь сформулировать иначе?",
    };
  }

  if (kind === "query") {
    const scope = extractField(raw, "SCOPE")?.toLowerCase();
    return { kind: "query", scope: ["today", "tasks", "all"].includes(scope) ? scope : "all" };
  }

  const type = extractField(raw, "TYPE")?.toLowerCase();
  const whenKind = extractField(raw, "WHEN_KIND")?.toLowerCase();
  const whenValue = extractField(raw, "WHEN_VALUE");
  const time = extractField(raw, "TIME");
  const textMatch = raw.match(/TEXT\s*[:=]\s*([\s\S]+)/i);

  return {
    kind: "note",
    type: ["task", "idea", "note"].includes(type) ? type : "note",
    dueAt: resolveDueDate(timezone, { whenKind, whenValue, time }),
    // The model occasionally truncates its answer before reaching TEXT:
    // (confirmed while testing) — fall back to the original transcribed
    // message rather than leaking raw model formatting into a note's text.
    text: textMatch ? textMatch[1].trim().split("\n")[0] : originalText.trim(),
  };
}

/**
 * @param {string} authKey
 * @param {string} rawText - transcribed voice note or typed message
 * @param {string} [timezone] - IANA zone, e.g. "Europe/Samara" (default) or "Asia/Vladivostok"
 * @param {Array<{role:'user'|'assistant', content:string}>} [history] - recent conversation turns, oldest first
 * @returns {Promise<{kind:'reply', answer:string} | {kind:'query', scope:'today'|'tasks'|'all'} | {kind:'note', type:string, dueAt:string|null, text:string}>}
 */
export async function classifyNote(authKey, rawText, timezone = "Europe/Samara", history = []) {
  const lastAssistantTurn = [...history].reverse().find((h) => h.role === "assistant")?.content;
  const raw = await chat({
    authKey,
    messages: [
      { role: "system", content: buildSystemPrompt(timezone, lastAssistantTurn) },
      ...history.map((h) => ({ role: h.role, content: h.content })),
      { role: "user", content: rawText },
    ],
    temperature: 0.3,
  });
  return parse(timezone, raw, rawText);
}

/**
 * Focused follow-up to "Когда напомнить?" — extracts a due date/time from
 * the user's answer, or null if the reply doesn't actually specify a time
 * (e.g. "без напоминания", or the user just moved on to something else).
 * Deliberately separate from classifyNote's general-purpose prompt: asking
 * one narrow question gets a much more reliable answer than folding this
 * into the bigger reply/query/note decision.
 *
 * @returns {Promise<string|null>} ISO due date, or null if no time was given
 */
export async function extractDueDateFromReply(authKey, rawText, timezone = "Europe/Samara") {
  const now = getTzParts(timezone);
  const todayLabel = `${now.year}-${pad(now.month)}-${pad(now.day)} ${pad(now.hour)}:${pad(now.minute)} (${now.weekday})`;
  const offset = getUtcOffset(timezone);

  const prompt = `Ты только что спросил пользователя "Когда напомнить?" про задачу без указанного срока. Вот его ответ. Извлеки срок в том же формате, что обычно:

Сейчас у пользователя: ${todayLabel}, часовой пояс UTC${offset}.

WHEN_KIND: <weekday|relative_days|relative_hours|date|none>
WHEN_VALUE: <значение или none>
TIME: <ЧЧ:ММ или none>

Если ответ НЕ про время (например "без напоминания", "не надо", "потом", или явно другая мысль) — верни WHEN_KIND: none.
relative_hours покрывает и минуты (дробное число часов, например 0.05 для 3 минут) — никогда не используй другую категорию для минут.
Ответь СТРОГО этими тремя строками, без лишнего текста.`;

  const raw = await chat({
    authKey,
    messages: [
      { role: "system", content: prompt },
      { role: "user", content: rawText },
    ],
    temperature: 0.2,
  });

  const whenKind = extractField(raw, "WHEN_KIND")?.toLowerCase();
  const whenValue = extractField(raw, "WHEN_VALUE");
  const time = extractField(raw, "TIME");
  return resolveDueDate(timezone, { whenKind, whenValue, time });
}
