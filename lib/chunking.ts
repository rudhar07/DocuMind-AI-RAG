import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";

export type Chunk = { text: string; page?: number; chunkIndex: number };

/**
 * Recursive character splitting — the standard RAG chunking strategy.
 *
 * Why this strategy:
 *  - Tries to split on the most "semantic" boundary first (paragraphs),
 *    falling back to lines, then sentences, then words. This keeps related
 *    ideas together rather than slicing them mid-sentence.
 *  - Overlap (chunkOverlap) carries ~150 chars of trailing context into the
 *    next chunk so a sentence straddling a boundary still has its full
 *    meaning available somewhere in the index.
 *
 * Tuning:
 *  - chunkSize 1000 chars (~250 tokens) is a sweet spot for MiniLM-L6 which
 *    has a 512-token cap. Big enough to hold context, small enough to retrieve
 *    precisely.
 */
export async function chunkPages(pages: { page: number; text: string }[]): Promise<Chunk[]> {
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 1000,
    chunkOverlap: 150,
    separators: ["\n\n", "\n", ". ", " ", ""],
  });

  const chunks: Chunk[] = [];
  let chunkIndex = 0;

  for (const { page, text } of pages) {
    if (!text.trim()) continue;
    const pieces = await splitter.splitText(text);
    for (const piece of pieces) {
      const trimmed = piece.trim();
      if (trimmed.length < 20) continue; // discard noise
      chunks.push({ text: trimmed, page, chunkIndex: chunkIndex++ });
    }
  }
  return chunks;
}
