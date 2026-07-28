import { pipeline } from "@xenova/transformers";

/**
 * Self-hosted embeddings — GigaChat's embeddings endpoint turned out to
 * require a paid tier (confirmed by an actual 402 Payment Required response
 * on the free personal account), so semantic search runs on a small
 * open-source multilingual model instead: zero ongoing cost, runs in this
 * same Node process, no external API. Model downloads once (~120MB) and is
 * cached on first use.
 *
 * multilingual-e5 models expect a "query: " / "passage: " prefix convention
 * for best retrieval quality — a note being stored is a "passage", a search
 * typed by the user is a "query".
 */
let embedderPromise = null;

function getEmbedder() {
  if (!embedderPromise) {
    embedderPromise = pipeline("feature-extraction", "Xenova/multilingual-e5-small");
  }
  return embedderPromise;
}

async function embedText(prefixedText) {
  const embedder = await getEmbedder();
  const output = await embedder(prefixedText, { pooling: "mean", normalize: true });
  return Array.from(output.data);
}

export function embedNote(text) {
  return embedText(`passage: ${text}`);
}

export function embedQuery(text) {
  return embedText(`query: ${text}`);
}
