// Runs classifyNote() against real scripted phrases via GigaChat, no
// Telegram/Supabase/SpeechKit involved — just checking classification and
// date-extraction quality before wiring up the rest of the pipeline.
// Run: npm run test-classify
import "dotenv/config";
import { classifyNote } from "../src/notes/classify.js";

const authKey = process.env.GIGACHAT_AUTH_KEY;
if (!authKey) {
  console.error("Missing GIGACHAT_AUTH_KEY in .env");
  process.exit(1);
}

const phrases = [
  "надо не забыть в четверг в 15:00 позвонить Сергею по поводу договора",
  "кстати, пришла идея: а что если в нашем приложении сделать реферальную программу не за деньги, а за бонусы",
  "завтра утром купить молоко и хлеб",
  "думаю сделать приложение для собаководов, что-то вроде выгула по подписке",
  "напомни мне через 2 часа выпить таблетки",
];

for (const phrase of phrases) {
  const result = await classifyNote(authKey, phrase);
  console.log(`\nВход: "${phrase}"`);
  console.log(`  type: ${result.type}`);
  console.log(`  dueAt: ${result.dueAt ?? "(нет)"}`);
  console.log(`  text: ${result.text}`);
}
