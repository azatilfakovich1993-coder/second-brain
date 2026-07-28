import cron from "node-cron";
import { getDueReminders, markStatus, getAllUserIds, getNotesSince, getTasks } from "../db/supabase.js";
import { sendMessage } from "../notify/telegram.js";

/** Checks every minute for reminders whose time has come and sends them. */
function startReminderJob(env) {
  cron.schedule("* * * * *", async () => {
    let due;
    try {
      due = await getDueReminders(env);
    } catch (err) {
      console.error("reminder check failed:", err.message);
      return;
    }
    for (const note of due) {
      try {
        await sendMessage(env, note.telegram_user_id, `⏰ Напоминание: ${note.text}`);
        await markStatus(env, note.id, "sent");
      } catch (err) {
        console.error(`failed to send reminder ${note.id}:`, err.message);
      }
    }
  });
}

export function buildDigestText(notesToday, openTasks) {
  const ideas = notesToday.filter((n) => n.type === "idea").length;
  const tasksAdded = notesToday.filter((n) => n.type === "task").length;
  const notes = notesToday.filter((n) => n.type === "note").length;

  const lines = [`Итог дня: ${ideas} иде${ideas === 1 ? "я" : "и"}, ${tasksAdded} задач${tasksAdded === 1 ? "а" : ""}, ${notes} заметок.`];
  if (openTasks.length > 0) {
    lines.push("", "Ближайшие задачи:");
    for (const t of openTasks.slice(0, 5)) {
      const when = t.due_at
        ? new Date(t.due_at).toLocaleString("ru-RU", { timeZone: "Europe/Moscow", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
        : "без срока";
      lines.push(`— ${t.text} (${when})`);
    }
  }
  return lines.join("\n");
}

/** Sends a short "here's what you captured today" digest at 21:00 Moscow time. */
function startDigestJob(env) {
  cron.schedule(
    "0 21 * * *",
    async () => {
      let userIds;
      try {
        userIds = await getAllUserIds(env);
      } catch (err) {
        console.error("digest job failed to list users:", err.message);
        return;
      }

      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);

      for (const userId of userIds) {
        try {
          const [notesToday, openTasks] = await Promise.all([
            getNotesSince(env, userId, startOfDay.toISOString()),
            getTasks(env, userId),
          ]);
          if (notesToday.length === 0) continue; // nothing captured today — skip the digest for this user
          await sendMessage(env, userId, buildDigestText(notesToday, openTasks));
        } catch (err) {
          console.error(`digest failed for user ${userId}:`, err.message);
        }
      }
    },
    { timezone: "Europe/Moscow" }
  );
}

export function startSchedulers(env) {
  startReminderJob(env);
  startDigestJob(env);
}
