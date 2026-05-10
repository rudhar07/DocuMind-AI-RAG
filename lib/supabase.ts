import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Service-role client. Server-side only — bypasses RLS, never expose to browser.
export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
});

const TABLE = "documents";

export type ChunkPayload = {
  text: string;
  source: string;
  page?: number;
  chunkIndex: number;
};

/** Wipe all rows. Each upload starts a fresh notebook. */
export async function resetCollection(): Promise<void> {
  const { error } = await supabase.from(TABLE).delete().gt("id", 0);
  if (error) throw error;
}

export async function upsertChunks(
  vectors: number[][],
  payloads: ChunkPayload[]
): Promise<void> {
  const rows = vectors.map((vec, i) => ({
    content: payloads[i].text,
    metadata: {
      source: payloads[i].source,
      page: payloads[i].page,
      chunkIndex: payloads[i].chunkIndex,
    },
    embedding: vec,
  }));

  // Insert in batches — Supabase rejects very large single requests.
  const BATCH = 100;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const { error } = await supabase.from(TABLE).insert(batch);
    if (error) throw error;
  }
}

export async function searchChunks(queryVector: number[], k = 4) {
  const { data, error } = await supabase.rpc("match_documents", {
    query_embedding: queryVector,
    match_count: k,
  });
  if (error) throw error;
  if (!data) return [];

  return (data as Array<{ content: string; metadata: any; similarity: number }>).map((r) => ({
    score: r.similarity,
    payload: {
      text: r.content,
      source: r.metadata?.source ?? "document",
      page: r.metadata?.page,
      chunkIndex: r.metadata?.chunkIndex ?? 0,
    } as ChunkPayload,
  }));
}
