// Fallback data shown when the app isn't running inside real Telegram (no
// valid initData -> API calls 401) — lets us eyeball all screens with
// `npm run dev` in a plain browser before wiring up a live bot.
export const mockNotes = [
  { id: 1, type: "task", text: "Позвонить Сергею по договору", due_at: "2026-07-30T12:00:00Z", created_at: "2026-07-28T09:00:00Z" },
  { id: 2, type: "idea", text: "Сделать реферальную программу за бонусы, а не деньги", due_at: null, created_at: "2026-07-28T09:05:00Z" },
  { id: 3, type: "note", text: "Купить молоко и хлеб", due_at: null, created_at: "2026-07-27T18:20:00Z" },
  { id: 4, type: "idea", text: "Приложение для собаководов — выгул по подписке", due_at: null, created_at: "2026-07-20T14:00:00Z" },
];

export const mockTasks = mockNotes.filter((n) => n.type === "task");

export const mockDigest = {
  text: "Итог дня: 1 идея, 1 задача, 1 заметка.\n\nБлижайшие задачи:\n— Позвонить Сергею по договору (30.07, 15:00)",
};
