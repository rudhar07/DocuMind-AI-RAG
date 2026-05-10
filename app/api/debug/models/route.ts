import { NextResponse } from "next/server";

// GET /api/debug/models — lists every Gemini model your API key can access,
// with each model's supported methods. Use this to verify which embedding
// model is actually available to your account.
export async function GET() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "GEMINI_API_KEY not set" }, { status: 500 });
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
  );
  if (!res.ok) {
    return NextResponse.json(
      { error: `ListModels failed: ${res.status}`, detail: await res.text() },
      { status: 500 }
    );
  }
  const data = await res.json();

  const summarized = (data.models || []).map((m: any) => ({
    name: (m.name as string).replace(/^models\//, ""),
    methods: m.supportedGenerationMethods || [],
  }));

  const embedders = summarized.filter((m: any) =>
    m.methods.some((x: string) => x.toLowerCase().includes("embedcontent"))
  );

  return NextResponse.json({
    embedders,
    all: summarized,
  });
}
