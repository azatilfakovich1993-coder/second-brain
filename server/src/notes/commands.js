import { setUserTimezone, getUserTimezone } from "../db/supabase.js";

// Telegram bot commands (messages starting with "/") must never be sent to
// classifyNote() — confirmed by actually testing in real Telegram: "/start"
// confused GigaChat into echoing back a fragment of its own system prompt
// instead of a sensible classification. Intercept known commands here
// before the note-processing pipeline ever sees the message.
const WELCOME_TEXT = `Привет! Я твой второй мозг 🧠

Просто надиктуй или напиши любую мысль — задачу, идею, список, что угодно. Я сам решу, что это, и если нужно — напомню в срок.

Например: «завтра в 10 утра позвонить в банк» или «идея: сделать реферальную программу за бонусы».

Если бываешь в разных часовых поясах — команда /timezone Europe/Samara (или любой другой IANA-пояс, например Asia/Vladivostok, Europe/Moscow) переключит, по какому времени считать напоминания. Сейчас: /timezone без аргумента покажет текущий.`;

function isValidTimezone(zone) {
  try {
    new Intl.DateTimeFormat(undefined, { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {string} text
 * @param {object} env
 * @param {number} telegramUserId
 * @returns {Promise<string|null>} - reply text if this was a recognized command, else null
 */
export async function handleCommand(text, env, telegramUserId) {
  if (!text.startsWith("/")) return null;
  const [command, ...rest] = text.split(/\s+/);
  const commandName = command.split("@")[0];

  if (commandName === "/start" || commandName === "/help") return WELCOME_TEXT;

  if (commandName === "/timezone") {
    const zone = rest[0];
    if (!zone) {
      const current = await getUserTimezone(env, telegramUserId);
      return `Сейчас используется пояс: ${current}\nЧтобы сменить: /timezone Europe/Samara (или свой, например Asia/Vladivostok, Europe/Moscow).`;
    }
    if (!isValidTimezone(zone)) {
      return `Не знаю такой пояс: "${zone}". Нужен формат IANA, например Europe/Samara, Europe/Moscow, Asia/Vladivostok.`;
    }
    await setUserTimezone(env, telegramUserId, zone);
    return `Готово, часовой пояс переключён на ${zone}.`;
  }

  return "Не знаю такой команды — просто напиши мне мысль текстом или голосом.";
}
