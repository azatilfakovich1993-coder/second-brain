import { openInvoice } from "../lib/telegram.js";

// Placeholder screen: actual invoice creation needs a backend endpoint that
// calls Telegram's createInvoiceLink (Bot API) and a connected payment
// provider — neither exists yet, so the button just explains that for now
// rather than silently doing nothing.
export default function Subscription() {
  function handleSubscribe() {
    const invoiceUrl = null; // TODO: fetch a real invoice link from a backend endpoint once payments are wired up
    if (invoiceUrl) {
      openInvoice(invoiceUrl, () => {});
    } else {
      alert("Оплата пока не подключена — это заготовка экрана.");
    }
  }

  return (
    <div className="screen">
      <h1>Подписка</h1>
      <div className="card">
        <div className="type">Бесплатно</div>
        <div className="text">До 30 голосовых заметок в месяц</div>
      </div>
      <div className="card">
        <div className="type">Премиум</div>
        <div className="text">Расширенный лимит минут, семантический поиск без ограничений, вечерний дайджест</div>
        <button className="subscribe-btn" onClick={handleSubscribe}>
          Оформить за 490 ₽/мес
        </button>
      </div>
    </div>
  );
}
