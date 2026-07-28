// Telegram bot commands (messages starting with "/") must never be sent to
// classifyNote() — confirmed by actually testing in real Telegram: "/start"
// confused GigaChat into echoing back a fragment of its own system prompt
// instead of a sensible classification. Intercept known commands here
// before the note-processing pipeline ever sees the message.
const WELCOME_TEXT = `Привет! Я твой второй мозг 🧠

Просто надиктуй или напиши любую мысль — задачу, идею, список, что угодно. Я сам решу, что это, и если нужно — напомню в срок.

Например: «завтра в 10 утра позвонить в банк» или «идея: сделать реферальную программу за бонусы».`;

/**
 * @param {string} text
 * @returns {string|null} - reply text if this was a recognized command, else null
 */
export function handleCommand(text) {
  if (!text.startsWith("/")) return null;
  const command = text.split(/[\s@]/)[0];

  if (command === "/start" || command === "/help") return WELCOME_TEXT;

  return "Не знаю такой команды — просто напиши мне мысль текстом или голосом.";
}
