import { getInitData } from "./telegram.js";

// Same-origin by default: in production the backend serves this build as
// static files, so "/api/..." resolves correctly with no extra config.
// Override with VITE_API_URL during local dev against a remote backend.
const BASE = import.meta.env.VITE_API_URL ?? "";

async function request(path) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "X-Telegram-Init-Data": getInitData() },
  });
  if (!res.ok) throw new Error(`${path} -> HTTP ${res.status}`);
  return res.json();
}

export const getNotes = () => request("/api/notes");
export const getTasks = () => request("/api/tasks");
export const getDigest = () => request("/api/digest");
export const search = (q) => request(`/api/search?q=${encodeURIComponent(q)}`);
