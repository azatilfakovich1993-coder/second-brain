// Quick pre-deployment smoke test: long-polls Telegram (no public HTTPS
// needed, unlike the real webhook in server.js) and runs every text message
// through the real classifyNote() pipeline, replying with the result.
// Doesn't touch Supabase/SpeechKit (not configured yet) — just proves the
// bot token + GigaChat classification are alive end-to-end.
// Run: node scripts/test-bot-poll.js, then message the bot in Telegram.
import "dotenv/config";
import { classifyNote } from "../src/notes/classify.js";
import { sendMessage } from "../src/notify/telegram.js";
import { handleCommand } from "../src/notes/commands.js";

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error("Missing TELEGRAM_BOT_TOKEN in .env");
  process.exit(1);
}

let offset = 0;
console.log("Polling for messages — send your bot a text message now (Ctrl+C to stop)...");

while (true) {
  const res = await fetch(`https://api.telegram.org/bot${token}/getUpdates?timeout=25&offset=${offset}`);
  const data = await res.json();

  for (const update of data.result ?? []) {
    offset = update.update_id + 1;
    const message = update.message;
    if (!message?.text) continue;

    console.log(`\nПолучено: "${message.text}"`);

    if (message.text.startsWith("/")) {
      const commandReply = await handleCommand(message.text, process.env, message.chat.id);
      console.log(commandReply);
      await sendMessage(process.env, message.chat.id, commandReply);
      continue;
    }

    const { type, dueAt, text } = await classifyNote(process.env.GIGACHAT_AUTH_KEY, message.text);
    const reply = [`Тип: ${type}`, dueAt ? `Срок: ${new Date(dueAt).toLocaleString("ru-RU", { timeZone: "Europe/Samara" })}` : null, `Текст: ${text}`]
      .filter(Boolean)
      .join("\n");
    console.log(reply);
    await sendMessage(process.env, message.chat.id, reply);
  }
}
