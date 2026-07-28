import { useEffect, useState } from "react";
import { getNotes } from "../lib/api.js";
import { mockNotes } from "../lib/mockData.js";
import NoteCard from "./NoteCard.jsx";

export default function Feed() {
  const [notes, setNotes] = useState(null);
  const [isDemo, setIsDemo] = useState(false);

  useEffect(() => {
    getNotes()
      .then(setNotes)
      .catch(() => {
        setIsDemo(true);
        setNotes(mockNotes);
      });
  }, []);

  return (
    <div className="screen">
      <h1>Лента</h1>
      {isDemo && <div className="demo-banner">Демо-данные — приложение не открыто внутри Telegram.</div>}
      {notes === null && <div className="empty">Загрузка…</div>}
      {notes?.length === 0 && <div className="empty">Пока ничего нет — надиктуй боту первую мысль.</div>}
      {notes?.map((n) => (
        <NoteCard key={n.id} note={n} />
      ))}
    </div>
  );
}
