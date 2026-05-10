// Direct REST calls to the Gemini embeddings endpoint.
// We bypass @google/generative-ai for embeddings because:
//  1. SDK v0.21 doesn't type `outputDimensionality` — gemini-embedding-001 needs it
//     (default output is 3072 dims, our pgvector column is 768).
//  2. Different accounts have different sets of embedding models available
//     (Google has been deprecating older names). Discovering at runtime is safer
//     than hard-coding a single model name.

const API_BASE = "https://generativelanguage.googleapis.com/v1beta";

export const EMBEDDING_DIM = 768;

// Preference order — newest first. We pick the first one your key actually exposes.
const PREFERRED_MODELS = [
  "gemini-embedding-001",
  "text-embedding-004",
  "embedding-001",
];

let cachedModel: string | null = null;

async function discoverModel(): Promise<string> {
  if (cachedModel) return cachedModel;

  const apiKey = process.env.GEMINI_API_KEY!;
  const res = await fetch(`${API_BASE}/models?key=${apiKey}`);
  if (!res.ok) {
    throw new Error(`Could not list Gemini models: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();

  const available = (data.models || [])
    .filter((m: any) =>
      (m.supportedGenerationMethods || []).some((x: string) =>
        x.toLowerCase().includes("embedcontent")
      )
    )
    .map((m: any) => (m.name as string).replace(/^models\//, ""));

  console.log("[embeddings] available embedding models on this key:", available);

  for (const candidate of PREFERRED_MODELS) {
    if (available.includes(candidate)) {
      cachedModel = candidate;
      console.log(`[embeddings] selected: ${candidate}`);
      return candidate;
    }
  }

  if (available.length > 0) {
    cachedModel = available[0];
    console.log(`[embeddings] none of the preferred models found, falling back to: ${cachedModel}`);
    return cachedModel!;
  }

  throw new Error(
    "No embedding-capable model is available on your Gemini API key. " +
      "Visit https://aistudio.google.com/apikey and ensure your project has the Generative Language API enabled."
  );
}

async function embedSingle(text: string, taskType: "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY"): Promise<number[]> {
  const apiKey = process.env.GEMINI_API_KEY!;
  const model = await discoverModel();

  const body: Record<string, unknown> = {
    content: { parts: [{ text }], role: "user" },
    taskType,
  };
  // gemini-embedding-001 outputs 3072 dims by default; force 768 to match the schema.
  if (model.startsWith("gemini-embedding")) {
    body.outputDimensionality = EMBEDDING_DIM;
  }

  const res = await fetch(`${API_BASE}/models/${model}:embedContent?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Embed call failed (${model}): ${res.status} — ${errText}`);
  }

  const data = await res.json();
  return data.embedding.values as number[];
}

/** Embed each chunk for indexing. Sequential — more compatible than batchEmbedContents. */
export async function embedBatch(texts: string[]): Promise<number[][]> {
  const out: number[][] = [];
  for (const text of texts) {
    out.push(await embedSingle(text, "RETRIEVAL_DOCUMENT"));
  }
  return out;
}

/** Embed a user query. */
export async function embedQuery(text: string): Promise<number[]> {
  return embedSingle(text, "RETRIEVAL_QUERY");
}
