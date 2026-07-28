const TYPE_LABEL = { task: "Задача", idea: "Идея", note: "Заметка" };

function formatDue(dueAt) {
  if (!dueAt) return null;
  return new Date(dueAt).toLocaleString("ru-RU", {
    timeZone: "Europe/Moscow",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function NoteCard({ note }) {
  return (
    <div className="card">
      <div className="type">{TYPE_LABEL[note.type] ?? note.type}</div>
      <div className="text">{note.text}</div>
      {note.due_at && <div className="due">⏰ {formatDue(note.due_at)}</div>}
    </div>
  );
}
