import { NextRequest, NextResponse } from "next/server";
import { embedQuery } from "@/lib/embeddings";
import { searchChunks } from "@/lib/supabase";
import { generateAnswer } from "@/lib/gemini";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const { question } = await req.json();
    if (!question || typeof question !== "string" || !question.trim()) {
      return NextResponse.json({ error: "Missing question." }, { status: 400 });
    }

    const queryVec = await embedQuery(question);
    const results = await searchChunks(queryVec, 4);

    if (results.length === 0) {
      return NextResponse.json({
        answer: "No document has been indexed yet — please upload one first.",
        sources: [],
      });
    }

    const answer = await generateAnswer(
      question,
      results.map((r) => ({
        text: r.payload.text,
        page: r.payload.page,
        source: r.payload.source,
      }))
    );

    return NextResponse.json({
      answer,
      sources: results.map((r) => ({
        page: r.payload.page,
        source: r.payload.source,
        score: r.score,
        preview: r.payload.text.slice(0, 240),
      })),
    });
  } catch (err: any) {
    console.error("[/api/chat]", err);
    return NextResponse.json(
      { error: err?.message ?? "Failed to answer." },
      { status: 500 }
    );
  }
}
