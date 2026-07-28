import { useEffect, useState } from "react";
import { getDigest } from "../lib/api.js";
import { mockDigest } from "../lib/mockData.js";

export default function Digest() {
  const [digest, setDigest] = useState(null);
  const [isDemo, setIsDemo] = useState(false);

  useEffect(() => {
    getDigest()
      .then((d) => setDigest(d.text))
      .catch(() => {
        setIsDemo(true);
        setDigest(mockDigest.text);
      });
  }, []);

  return (
    <div className="screen">
      <h1>Дайджест дня</h1>
      {isDemo && <div className="demo-banner">Демо-данные — приложение не открыто внутри Telegram.</div>}
      {digest === null ? (
        <div className="empty">Загрузка…</div>
      ) : (
        <div className="card">
          <div className="text" style={{ whiteSpace: "pre-line" }}>
            {digest}
          </div>
        </div>
      )}
    </div>
  );
}
