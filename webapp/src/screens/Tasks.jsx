import { useEffect, useState } from "react";
import { getTasks } from "../lib/api.js";
import { mockTasks } from "../lib/mockData.js";
import NoteCard from "./NoteCard.jsx";

export default function Tasks() {
  const [tasks, setTasks] = useState(null);
  const [isDemo, setIsDemo] = useState(false);

  useEffect(() => {
    getTasks()
      .then(setTasks)
      .catch(() => {
        setIsDemo(true);
        setTasks(mockTasks);
      });
  }, []);

  return (
    <div className="screen">
      <h1>Задачи</h1>
      {isDemo && <div className="demo-banner">Демо-данные — приложение не открыто внутри Telegram.</div>}
      {tasks === null && <div className="empty">Загрузка…</div>}
      {tasks?.length === 0 && <div className="empty">Активных задач нет.</div>}
      {tasks?.map((t) => (
        <NoteCard key={t.id} note={t} />
      ))}
    </div>
  );
}
