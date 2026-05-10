import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export type ContextChunk = { text: string; page?: number; source: string };

/**
 * Generate a grounded answer from the retrieved context.
 *
 * The prompt is engineered to be strictly extractive:
 *  - Refuses to answer outside the document
 *  - Cites pages so the user can verify
 *  - Discourages hedging and filler
 */
export async function generateAnswer(question: string, context: ContextChunk[]): Promise<string> {
  const model = genAI.getGenerativeModel({
    // gemma-4-31b-it sits on a different free-tier quota bucket than the
    // gemini-* family, so it's not affected by the strict 20/day cap on
    // gemini-2.5-flash. Capable enough for RAG-style extraction from 4 chunks.
    model: "gemma-4-31b-it",
    generationConfig: { temperature: 0.2 },
  });

  const contextBlock = context
    .map(
      (c, i) =>
        `[Chunk ${i + 1}${c.page ? ` | Page ${c.page}` : ""} | Source: ${c.source}]\n${c.text}`
    )
    .join("\n\n---\n\n");

  const prompt = `You are DocuMind AI, a careful research assistant. Answer the user's question using ONLY the document context below.

RULES
- Use only facts present in the context. Do not draw on outside knowledge.
- If the answer is not contained in the context, reply exactly: "I couldn't find this in the document."
- Cite the page number inline when you state a fact, e.g. "(p. 4)".
- Be concise. Prefer bullet points for lists. No filler, no preamble.

DOCUMENT CONTEXT
${contextBlock}

USER QUESTION
${question}

ANSWER`;

  const result = await model.generateContent(prompt);
  return result.response.text();
}
