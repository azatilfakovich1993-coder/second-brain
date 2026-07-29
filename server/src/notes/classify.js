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

function buildSystemPrompt(timezone) {
  const now = getTzParts(timezone);
  const todayLabel = `${now.year}-${pad(now.month)}-${pad(now.day)} ${pad(now.hour)}:${pad(now.minute)} (${now.weekday})`;
  const offset = getUtcOffset(timezone);

  return `Ты разбираешь голосовую заметку пользователя (уже переведённую в текст) на структурированную запись для личной базы заметок.

Сейчас у пользователя: ${todayLabel}, часовой пояс UTC${offset}.

ВАЖНО: не пытайся сам вычислять итоговую дату — просто извлеки, ЧТО именно сказал пользователь, в одном из простых форматов ниже. Дату посчитает код, не ты.

Определи тип записи:
- task — есть конкретное действие, которое нужно сделать (со сроком или без).
- idea — мысль, идея, наблюдение на будущее, без конкретного действия/срока.
- note — просто заметка, список, факт для памяти.

Если type=task, укажи WHEN_KIND и WHEN_VALUE:
- weekday — если назван день недели ("в четверг"): WHEN_VALUE = само название дня недели (например "четверг").
- relative_days — если "сегодня"/"завтра"/"послезавтра": WHEN_VALUE = число дней (0/1/2).
- relative_hours — если "через N часов" ИЛИ "через N минут": WHEN_VALUE = число часов, дробное для минут (например 0.5 для получаса, 0.05 для 3 минут). НЕ используй никакую другую категорию для минут — только relative_hours с дробным числом.
- date — если названа конкретная дата: WHEN_VALUE в формате ДД.ММ или ДД.ММ.ГГГГ.
- none — если срок не назван вовсе.

TIME — конкретное время суток, если названо (формат ЧЧ:ММ), иначе "none". Для relative_hours всегда "none".

Ответь СТРОГО в этом формате — ВСЕГДА все строки:
TYPE: <task|idea|note>
WHEN_KIND: <weekday|relative_days|relative_hours|date|none>
WHEN_VALUE: <значение или none>
TIME: <ЧЧ:ММ или none>
TEXT: <краткая очищенная формулировка заметки, без "надо не забыть" и т.п. — сама суть>`;
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
  const type = extractField(raw, "TYPE")?.toLowerCase();
  const whenKind = extractField(raw, "WHEN_KIND")?.toLowerCase();
  const whenValue = extractField(raw, "WHEN_VALUE");
  const time = extractField(raw, "TIME");
  const textMatch = raw.match(/TEXT\s*[:=]\s*([\s\S]+)/i);

  return {
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
 */
export async function classifyNote(authKey, rawText, timezone = "Europe/Samara") {
  const raw = await chat({
    authKey,
    messages: [
      { role: "system", content: buildSystemPrompt(timezone) },
      { role: "user", content: rawText },
    ],
    temperature: 0.3,
  });
  return parse(timezone, raw, rawText);
}
