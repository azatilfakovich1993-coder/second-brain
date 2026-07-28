/**
 * Yandex SpeechKit speech-to-text — synchronous recognition, good enough for
 * short voice messages (Telegram voice notes are usually well under a
 * minute and arrive as OGG/Opus, which SpeechKit accepts natively as
 * `OggOpus`).
 *
 * DRAFT — verify request shape (folderId as query param vs required in the
 * body, exact header names) against the current Yandex Cloud docs the first
 * time this runs with a real key; API details drift over time same as with
 * the other external services in this project.
 */
const STT_URL = "https://stt.api.cloud.yandex.net/speech/v1/stt:recognize";

/**
 * @param {object} env
 * @param {Buffer} audioBuffer - raw OGG/Opus bytes (as downloaded from Telegram)
 * @returns {Promise<string>}
 */
export async function recognizeSpeech(env, audioBuffer) {
  const params = new URLSearchParams({
    lang: "ru-RU",
    format: "oggopus",
    folderId: env.YANDEX_FOLDER_ID,
  });

  const res = await fetch(`${STT_URL}?${params}`, {
    method: "POST",
    headers: {
      Authorization: `Api-Key ${env.YANDEX_SPEECHKIT_API_KEY}`,
    },
    body: audioBuffer,
  });

  const data = await res.json();
  if (data.error_code) {
    throw new Error(`Yandex SpeechKit error: ${data.error_code} — ${data.error_message ?? ""}`);
  }
  return data.result ?? "";
}
