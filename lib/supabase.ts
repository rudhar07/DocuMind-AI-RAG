import { createClient } from "@supabase/supabase-js";
import dns from "node:dns";

// Override Node's default DNS resolution to use public resolvers (Google +
// Cloudflare + Quad9). On some home/ISP networks the local resolver returns
// EAI_AGAIN intermittently when Node tries to look up the Supabase hostname,
// even though the project is healthy and reachable from the browser. Browsers
// use a separate resolver path so they don't see the same failures. Routing
// Node's lookups through public DNS makes this reliable.
//
// Also prefer IPv4 first — some networks have broken IPv6 paths that cause
// fetch() to hang on AAAA lookups before falling back.
dns.setDefaultResultOrder("ipv4first");
dns.setServers(["8.8.8.8", "1.1.1.1", "9.9.9.9"]);

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
