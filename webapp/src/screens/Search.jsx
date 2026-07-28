import { useState } from "react";
import { search } from "../lib/api.js";
import { mockNotes } from "../lib/mockData.js";
import NoteCard from "./NoteCard.jsx";

export default function Search() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(null);
  const [isDemo, setIsDemo] = useState(false);

  async function runSearch(e) {
    e.preventDefault();
    if (!query.trim()) return;
    try {
      const data = await search(query);
      setIsDemo(false);
      setResults(data);
    } catch {
      setIsDemo(true);
      const q = query.toLowerCase();
      setResults(mockNotes.filter((n) => n.text.toLowerCase().includes(q)));
    }
  }

  return (
    <div className="screen">
      <h1>Поиск</h1>
      <form onSubmit={runSearch}>
        <input
          className="search-input"
          placeholder="Что я говорил про..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </form>
      {isDemo && <div className="demo-banner">Демо-данные — приложение не открыто внутри Telegram.</div>}
      {results?.length === 0 && <div className="empty">Ничего похожего не нашлось.</div>}
      {results?.map((n) => (
        <NoteCard key={n.id} note={n} />
      ))}
    </div>
  );
}
