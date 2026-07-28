import { useState } from "react";
import Feed from "./screens/Feed.jsx";
import Tasks from "./screens/Tasks.jsx";
import Search from "./screens/Search.jsx";
import Digest from "./screens/Digest.jsx";
import Subscription from "./screens/Subscription.jsx";
import { hapticSelect } from "./lib/telegram.js";

const TABS = [
  { id: "feed", label: "Лента", Component: Feed },
  { id: "tasks", label: "Задачи", Component: Tasks },
  { id: "search", label: "Поиск", Component: Search },
  { id: "digest", label: "Дайджест", Component: Digest },
  { id: "sub", label: "Подписка", Component: Subscription },
];

export default function App() {
  const [activeId, setActiveId] = useState("feed");
  const Active = TABS.find((t) => t.id === activeId).Component;

  return (
    <>
      <Active />
      <nav className="tabbar">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={t.id === activeId ? "active" : ""}
            onClick={() => {
              hapticSelect();
              setActiveId(t.id);
            }}
          >
            {t.label}
          </button>
        ))}
      </nav>
    </>
  );
}
