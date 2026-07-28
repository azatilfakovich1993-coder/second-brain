import "dotenv/config";
import express from "express";
import { processIncomingMessage } from "./src/notes/process.js";
import { handleCommand } from "./src/notes/commands.js";
import { embed } from "./src/llm/gigachat.js";
import { getFeed, getTasks, searchSimilar, getNotesSince } from "./src/db/supabase.js";
import { sendMessage, downloadFile, validateInitData } from "./src/notify/telegram.js";
import { buildDigestText } from "./src/reminders/scheduler.js";
import { startSchedulers } from "./src/reminders/scheduler.js";

const app = express();
app.use(express.json());

/**
 * Telegram delivers voice notes / text messages here (set via
 * setWebhook() from src/notify/telegram.js once PUBLIC_URL is known).
 */
app.post("/telegram/webhook", async (req, res) => {
  res.sendStatus(200); // ack immediately — Telegram retries on timeout, and our reply goes out via sendMessage separately.

  const message = req.body?.message;
  if (!message) return;
  const telegramUserId = message.chat.id;

  try {
    if (message.text?.startsWith("/")) {
      await sendMessage(process.env, telegramUserId, handleCommand(message.text));
      return;
    }

    let result;
    if (message.voice) {
      const buffer = await downloadFile(process.env, message.voice.file_id);
      result = await processIncomingMessage(process.env, { telegramUserId, voiceBuffer: buffer });
    } else if (message.text) {
      result = await processIncomingMessage(process.env, { telegramUserId, text: message.text });
    } else {
      return;
    }
    await sendMessage(process.env, telegramUserId, result.reply);
  } catch (err) {
    console.error("webhook processing failed:", err);
    await sendMessage(process.env, telegramUserId, "Что-то пошло не так, попробуй ещё раз чуть позже.");
  }
});

/** Requires a valid Telegram Mini App `initData` on every /api/* request. */
function requireTelegramUser(req, res, next) {
  const initData = req.get("X-Telegram-Init-Data");
  const user = validateInitData(process.env, initData);
  if (!user) return res.status(401).json({ error: "invalid Telegram init data" });
  req.telegramUserId = user.id;
  next();
}
app.use("/api", requireTelegramUser);

app.get("/api/notes", async (req, res) => {
  try {
    res.json(await getFeed(process.env, req.telegramUserId));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/tasks", async (req, res) => {
  try {
    res.json(await getTasks(process.env, req.telegramUserId));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/search", async (req, res) => {
  const q = req.query.q;
  if (!q) return res.status(400).json({ error: "missing q" });
  try {
    const embedding = await embed(process.env.GIGACHAT_AUTH_KEY, q);
    res.json(await searchSimilar(process.env, req.telegramUserId, embedding, 10));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/digest", async (req, res) => {
  try {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const [notesToday, openTasks] = await Promise.all([
      getNotesSince(process.env, req.telegramUserId, startOfDay.toISOString()),
      getTasks(process.env, req.telegramUserId),
    ]);
    res.json({ text: buildDigestText(notesToday, openTasks), notesToday, openTasks });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

startSchedulers(process.env);

const port = process.env.PORT ?? 3001;
app.listen(port, () => console.log(`second-brain server listening on :${port}`));
