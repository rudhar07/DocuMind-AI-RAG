# DocuMind AI

> Chat with any document. Upload a PDF or text file, ask questions in natural language, and get answers grounded in the document — never hallucinated.

DocuMind AI is a NotebookLM-style retrieval-augmented generation (RAG) application built with Next.js, Google Gemini (used for both embeddings and generation), and Supabase pgvector. Drop in a 100-page research paper, a textbook chapter, or your own notes — DocuMind indexes them in seconds and lets you have a real conversation with the content.

---

## Live demo

🔗 **[docu-mind-ai-rag.vercel.app](https://docu-mind-ai-rag.vercel.app/)**

---

## What it does

- **Upload** a PDF or `.txt` file (drag-and-drop or click)
- **Indexes** the document — chunks it intelligently, generates embeddings, stores them in a vector database
- **Answers** any question by retrieving the most relevant passages and grounding the LLM's response in them
- **Cites sources** — every answer comes with the original passages and page numbers so you can verify

If a question can't be answered from the document, DocuMind says so. It will not invent facts from the LLM's general knowledge.

---

## How it works — the RAG pipeline

```
INDEXING (once per upload)
┌──────────┐   ┌────────┐   ┌──────────────────┐   ┌──────────────────┐
│   PDF    │ → │ Chunk  │ → │  Embed           │ → │ Supabase         │
│ /  TXT   │   │ (~1k   │   │  (gemini-        │   │ (Postgres +      │
│          │   │  chars)│   │   embedding-001) │   │  pgvector)       │
└──────────┘   └────────┘   └──────────────────┘   └──────────────────┘

RETRIEVAL (each question)
┌──────────┐   ┌────────┐   ┌───────────┐   ┌──────────────┐
│ Question │ → │ Embed  │ → │  Search   │ → │ Gemini       │ → answer
│          │   │ query  │   │  top-k=4  │   │ (fallback    │
│          │   │        │   │           │   │  chain)      │
└──────────┘   └────────┘   └───────────┘   └──────────────┘
```

### Chunking strategy

DocuMind uses **recursive character splitting** (`@langchain/textsplitters`) configured at:

| Parameter      | Value      | Why                                                                                  |
| -------------- | ---------- | ------------------------------------------------------------------------------------ |
| `chunkSize`    | 1000 chars | ~250 tokens — comfortable size for retrieval precision while keeping enough context  |
| `chunkOverlap` | 150 chars  | Sentences crossing a chunk boundary stay searchable in either neighbouring chunk     |
| `separators`   | `\n\n`, `\n`, `. `, ` `, `""` | Splits on the most semantic boundary first (paragraphs), falls back to weaker ones |

Each chunk carries `{ text, page, chunkIndex, source }` as payload so the UI can cite it later.

### Embedding model

Google **`embedding-001`** — 768-dimensional, free tier. The model is asymmetric, so DocuMind tags each call with the right `taskType`:
- `RETRIEVAL_DOCUMENT` when indexing chunks
- `RETRIEVAL_QUERY` when embedding a user question

This gives noticeably better retrieval quality than treating queries and documents the same way.

### Generation

Google Gemini family at `temperature: 0.2`, behind a **fallback chain**: `gemini-2.5-flash-lite` → `gemini-flash-lite-latest` → `gemini-2.0-flash-lite` → `gemini-2.5-flash` → `gemini-flash-latest` → `gemma-4-31b-it`. Free-tier quotas vary per model per account, and the system silently falls through on 429 / 500 / quota errors so a single model running out doesn't break the app. The first successful model is cached for the process lifetime.

The prompt uses a few-shot pattern with `<answer>...</answer>` tag wrapping and defensive regex extraction — the model is instructed to refuse to answer outside the document and cite page numbers inline.

---

## Tech stack

| Layer        | Tool                                            |
| ------------ | ----------------------------------------------- |
| Frontend     | Next.js 14 · React 18 · TypeScript · Tailwind   |
| LLM          | Gemini family with fallback chain (lite → flash → gemma) |
| Embeddings   | Google `gemini-embedding-001` (auto-discovered, 768-dim) |
| Vector DB    | Supabase Postgres + pgvector (HNSW index)       |
| PDF parsing  | pdf-parse                                       |
| Chunking     | @langchain/textsplitters                        |
| Hosting      | Vercel                                          |

---

## Run it locally

### 1. Clone & install

```bash
git clone https://github.com/rudhar07/DocuMind-AI-RAG.git
cd DocuMind-AI-RAG
npm install
```

### 2. Get your free API keys

You need two free accounts. Neither requires a credit card.

| Service           | URL                                           | What to copy                                                                |
| ----------------- | --------------------------------------------- | --------------------------------------------------------------------------- |
| Google AI Studio  | https://aistudio.google.com/apikey            | API key → `GEMINI_API_KEY` (used for both embeddings and generation)        |
| Supabase          | https://supabase.com                          | Project URL → `SUPABASE_URL`, service-role key → `SUPABASE_SERVICE_ROLE_KEY` |

### 3. Set up the Supabase database

1. Create a new project at [supabase.com](https://supabase.com) (free tier is fine).
2. Wait ~1 minute for the database to provision.
3. Open the **SQL Editor** in the Supabase dashboard.
4. Paste the contents of [`schema.sql`](./schema.sql) and click **Run**. This:
   - enables the `pgvector` extension
   - creates the `documents` table with a `vector(768)` column (matching Gemini's embedding dimension)
   - creates an HNSW index for fast similarity search
   - creates the `match_documents` RPC the app calls at retrieval time
5. Copy your project URL and **service-role** key from **Project Settings → API**:
   - `Project URL` → `SUPABASE_URL`
   - `service_role` secret → `SUPABASE_SERVICE_ROLE_KEY`

> ⚠️ The **service-role** key bypasses Row Level Security. Use it only on the server (in API routes / `.env.local`). Never ship it to the browser.

### 4. Configure environment

```bash
cp .env.example .env.local
```

Edit `.env.local`:

```env
GEMINI_API_KEY=AIza...
SUPABASE_URL=https://xxxxxxxxxxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJh...
```

### 5. Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), drop a PDF, ask away.

---

## Deploy to Vercel

DocuMind is a stock Next.js app — deployment is one click.

1. Push this repo to GitHub.
2. Go to [vercel.com/new](https://vercel.com/new) and import the repo.
3. In **Environment Variables**, add the three keys from `.env.local` (`GEMINI_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`).
4. Click **Deploy**. Done.

> **Note:** Vercel's Hobby plan has a 4.5 MB request body limit, so very large PDFs may fail to upload on the deployed site. They'll work fine locally. For production use, host the upload endpoint on a service without this limit (Render, Fly, Railway).

---

## Project structure

```
documind-ai/
├── app/
│   ├── api/
│   │   ├── upload/route.ts    # POST — parse PDF, chunk, embed, store
│   │   └── chat/route.ts      # POST — embed Q, retrieve, generate
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx               # Landing + chat shell
├── components/
│   └── Chat.tsx               # All client-side state and UI
├── lib/
│   ├── pdf.ts                 # PDF → per-page text
│   ├── chunking.ts            # Recursive character splitter
│   ├── embeddings.ts          # Gemini embedding-001 wrapper
│   ├── supabase.ts            # pgvector client + insert/search helpers
│   └── gemini.ts              # Prompt + Gemini Flash call
├── schema.sql                 # Run once in Supabase SQL Editor
├── .env.example
├── next.config.js
├── package.json
└── README.md
```

Every file is under 200 lines. Read `lib/` first if you want to understand the RAG flow — it's all there.

---

## Design decisions

**Why fresh table per upload?** Each upload calls `resetCollection()`, truncating the `documents` table. This gives the cleanest single-document chat experience — no cross-contamination between unrelated PDFs. To support multiple persistent notebooks, add a `notebook_id` column, scope inserts and the `match_documents` RPC to it, and pass the active notebook ID through requests.

**Why Gemini embeddings instead of an open-source model?** Using Gemini for both embeddings and generation collapses the stack to a single provider with one API key — fewer moving parts, fewer ways to fail. `text-embedding-004` is high-quality, free, and supports asymmetric document/query encoding which actively improves retrieval over symmetric models. The trade-off is provider lock-in, but for a NotebookLM-style demo that's an acceptable price.

**Why `temperature: 0.2` on Gemini?** Lower temperature reduces creative reformulation. For an extractive RAG system we want the model to stick close to the retrieved text, not paraphrase it freely.

**Why no streaming?** Gemini supports streamed generation, and this would be a worthwhile follow-up. Skipped here in favour of simpler request/response semantics.

---

## License

MIT
