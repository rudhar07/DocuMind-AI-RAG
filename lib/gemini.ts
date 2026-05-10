import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export type ContextChunk = { text: string; page?: number; source: string };

// Fallback chain. Google allocates free-tier quota per-model and the allocations
// vary wildly by account — this user has 20/day on gemini-2.5-flash, 0 on
// gemini-2.0-flash, intermittent 500s on gemma-4-31b-it. Rather than betting on
// a single model, we try a list and fall through on 429 / 500 / quota errors.
//
// Ordering: lite/cheap variants first (most generous free quota), then mid-tier,
// then last-resort Gemma. The first model to return a successful response is
// cached for subsequent requests so we don't waste calls on dead-zero models.
const MODEL_CHAIN = [
  "gemini-2.5-flash-lite",
  "gemini-flash-lite-latest",
  "gemini-2.0-flash-lite",
  "gemini-2.5-flash",
  "gemini-flash-latest",
  "gemma-4-31b-it",
];

let cachedModel: string | null = null;

function isRetryable(err: any): boolean {
  const msg = String(err?.message ?? err);
  return (
    msg.includes("429") ||
    msg.includes("500") ||
    msg.includes("Too Many Requests") ||
    msg.includes("Internal") ||
    msg.toLowerCase().includes("quota")
  );
}

async function generateWithChain(prompt: string): Promise<string> {
  const order = cachedModel
    ? [cachedModel, ...MODEL_CHAIN.filter((m) => m !== cachedModel)]
    : MODEL_CHAIN;

  let lastError: unknown = null;
  for (const modelName of order) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: { temperature: 0.2 },
      });
      const result = await model.generateContent(prompt);
      if (cachedModel !== modelName) {
        console.log(`[gemini] using ${modelName}`);
        cachedModel = modelName;
      }
      return result.response.text();
    } catch (e) {
      lastError = e;
      if (!isRetryable(e)) throw e;
      const msg = String((e as any)?.message ?? e).slice(0, 100);
      console.warn(`[gemini] ${modelName} failed (${msg}) — falling through`);
      if (cachedModel === modelName) cachedModel = null;
    }
  }

  throw new Error(
    `All ${MODEL_CHAIN.length} Gemini models in the fallback chain failed. ` +
      `Last error: ${String((lastError as any)?.message ?? lastError)}. ` +
      `Free-tier quotas reset on a daily cycle — try again later, or check ` +
      `https://ai.dev/rate-limit for your current allocations.`
  );
}

/**
 * Generate a grounded answer from the retrieved context.
 *
 * Defense-in-depth on the output format:
 *   1. Few-shot examples teaching the exact (in-document, out-of-document) format.
 *   2. <answer>...</answer> tag wrapping; the seeded `<answer>` at prompt end
 *      anchors the model's continuation inside the tag.
 *   3. Regex extraction below strips anything outside the first <answer>...</answer>
 *      pair, so any chain-of-thought leak never reaches the user.
 */
export async function generateAnswer(question: string, context: ContextChunk[]): Promise<string> {
  const contextBlock = context
    .map(
      (c, i) =>
        `[Chunk ${i + 1}${c.page ? ` | Page ${c.page}` : ""} | Source: ${c.source}]\n${c.text}`
    )
    .join("\n\n---\n\n");

  const prompt = `You answer questions using only the provided passages. Wrap your final answer in <answer>...</answer> tags. Output nothing outside the tags. Cite pages inline like (p. 5). If the answer is not in the passages, reply <answer>I couldn't find this in the document.</answer>

EXAMPLE 1:
[Chunk 1 | Page 12 | Source: history.pdf]
The Treaty of Paris was signed on September 3, 1783, ending the American Revolutionary War.

[Chunk 2 | Page 14 | Source: history.pdf]
The signing took place at the Hôtel d'York in Paris.

Question: When was the Treaty of Paris signed?
<answer>September 3, 1783 (p. 12).</answer>

EXAMPLE 2:
[Chunk 1 | Page 3 | Source: bio.pdf]
Photosynthesis converts sunlight into chemical energy.

Question: What is the largest planet in our solar system?
<answer>I couldn't find this in the document.</answer>

NOW ANSWER THIS:
${contextBlock}

Question: ${question}
<answer>`;

  const raw = await generateWithChain(prompt);
  return extractAnswer(raw);
}

function extractAnswer(raw: string): string {
  const fullMatch = raw.match(/<answer>([\s\S]*?)<\/answer>/);
  if (fullMatch) return fullMatch[1].trim();

  const beforeClose = raw.match(/^([\s\S]*?)<\/answer>/);
  if (beforeClose) return beforeClose[1].replace(/<\/?answer>/g, "").trim();

  const afterOpen = raw.match(/<answer>([\s\S]*)$/);
  if (afterOpen) return afterOpen[1].trim();

  return raw.replace(/<\/?answer>/g, "").trim();
}
