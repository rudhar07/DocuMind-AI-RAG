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

  // Flowing prose, no section headers. Gemma 4 treats labeled sections like
  // "RULES" / "USER QUESTION" / "ANSWER" as output structure to echo, which
  // produces chain-of-thought leaks. The "Do not restate..." line is the
  // critical anti-leak instruction.
  const prompt = `Using only the following passages, answer the user's question briefly and directly. If the passages do not contain the answer, reply exactly: "I couldn't find this in the document." Cite page numbers inline like (p. 5). Do not restate the question, do not list the passages, do not show your reasoning — output only the final answer.

${contextBlock}

${question}`;

  const result = await model.generateContent(prompt);
  return result.response.text();
}
