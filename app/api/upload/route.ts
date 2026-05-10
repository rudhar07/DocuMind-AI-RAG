import { NextRequest, NextResponse } from "next/server";
import { parsePdf } from "@/lib/pdf";
import { chunkPages } from "@/lib/chunking";
import { embedBatch } from "@/lib/embeddings";
import { resetCollection, upsertChunks } from "@/lib/supabase";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "No file provided." }, { status: 400 });
    }

    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    const isText = file.type === "text/plain" || file.name.toLowerCase().endsWith(".txt");
    if (!isPdf && !isText) {
      return NextResponse.json(
        { error: "Only PDF (.pdf) or plain text (.txt) files are supported." },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    const pages = isPdf
      ? await parsePdf(buffer)
      : [{ page: 1, text: buffer.toString("utf-8") }];

    const chunks = await chunkPages(pages);
    if (chunks.length === 0) {
      return NextResponse.json(
        { error: "Could not extract any text from this file." },
        { status: 400 }
      );
    }

    const vectors = await embedBatch(chunks.map((c) => c.text));

    // Each upload starts a fresh notebook — wipe prior document.
    await resetCollection();
    await upsertChunks(
      vectors,
      chunks.map((c) => ({
        text: c.text,
        page: c.page,
        chunkIndex: c.chunkIndex,
        source: file.name,
      }))
    );

    return NextResponse.json({
      success: true,
      filename: file.name,
      pages: pages.length,
      chunks: chunks.length,
    });
  } catch (err: any) {
    console.error("[/api/upload]", err);
    return NextResponse.json(
      { error: err?.message ?? "Failed to index document." },
      { status: 500 }
    );
  }
}
