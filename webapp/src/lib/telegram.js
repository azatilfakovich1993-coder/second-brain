// Thin wrapper over window.Telegram.WebApp so the rest of the app doesn't
// need to know whether it's actually running inside Telegram (e.g. during
// local `npm run dev` in a plain browser, where the SDK object exists but
// most fields are empty — everything here degrades gracefully to null).
const tg = typeof window !== "undefined" ? window.Telegram?.WebApp : undefined;

export function initTelegram() {
  tg?.ready();
  tg?.expand();
}

export function getInitData() {
  return tg?.initData ?? "";
}

export function getTheme() {
  return tg?.colorScheme ?? "light";
}

export function openInvoice(url, onClosed) {
  if (!tg) {
    console.warn("Telegram.WebApp not available — can't open invoice outside Telegram");
    return;
  }
  tg.openInvoice(url, onClosed);
}

export function hapticSelect() {
  tg?.HapticFeedback?.selectionChanged();
}
