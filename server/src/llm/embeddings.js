/**
 * Embeddings via the Hugging Face Inference API (hosted, free) instead of
 * running the model in this process — a real 706MB RSS measurement showed
 * ONNX runtime's fixed overhead alone blows past Render's free 512MB
 * limit, regardless of how small the model file itself is. Offloading the
 * actual inference to Hugging Face's servers keeps this process light
 * enough to fit.
 *
 * sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2: multilingual
 * (incl. Russian), 384-dim, returns an already mean-pooled sentence vector
 * from the feature-extraction endpoint (no manual pooling or query/passage
 * prefixing needed, unlike e5-style models).
 */
const HF_MODEL = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2";
// api-inference.huggingface.co no longer resolves (confirmed via DNS lookup) —
// HF migrated the Inference API to router.huggingface.co ("Inference Providers").
// Path order matters: /models/{id}/pipeline/feature-extraction works,
// /pipeline/feature-extraction/{id} (the old api-inference shape) 404s here.
const HF_API_URL = `https://router.huggingface.co/hf-inference/models/${HF_MODEL}/pipeline/feature-extraction`;

async function embedText(env, text) {
  const res = await fetch(HF_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.HF_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ inputs: text, options: { wait_for_model: true } }),
  });
  const data = await res.json();
  if (data.error) {
    throw new Error(`Hugging Face Inference API error: ${data.error}`);
  }
  return data;
}

export function embedNote(env, text) {
  return embedText(env, text);
}

export function embedQuery(env, text) {
  return embedText(env, text);
}
