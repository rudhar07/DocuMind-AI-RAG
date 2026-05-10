"use client";

import { useEffect, useRef, useState } from "react";
import { Upload, Send, FileText, Loader2, RefreshCw, Sparkles } from "lucide-react";
import ReactMarkdown from "react-markdown";

type Source = { page?: number; source: string; score: number; preview: string };
type Message = { role: "user" | "assistant"; content: string; sources?: Source[] };
type DocInfo = { filename: string; pages: number; chunks: number } | null;

export default function Chat() {
  const [doc, setDoc] = useState<DocInfo>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  async function handleFile(file: File) {
    setUploading(true);
    setUploadError(null);
    setMessages([]);
    setDoc(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      setDoc({ filename: data.filename, pages: data.pages, chunks: data.chunks });
      setTimeout(() => inputRef.current?.focus(), 0);
    } catch (e: any) {
      setUploadError(e.message ?? "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function handleSend() {
    const q = input.trim();
    if (!q || sending) return;
    setMessages((m) => [...m, { role: "user", content: q }]);
    setInput("");
    setSending(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Request failed");
      setMessages((m) => [
        ...m,
        { role: "assistant", content: data.answer, sources: data.sources },
      ]);
    } catch (e: any) {
      setMessages((m) => [
        ...m,
        { role: "assistant", content: `Error: ${e.message ?? "Something went wrong"}` },
      ]);
    } finally {
      setSending(false);
    }
  }

  // ---------- Empty state: drop zone ----------
  if (!doc) {
    return (
      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const f = e.dataTransfer.files[0];
              if (f) handleFile(f);
            }}
            className={`border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition ${
              dragOver
                ? "border-violet-500 bg-violet-500/5"
                : "border-zinc-800 hover:border-violet-500/50 hover:bg-zinc-900/40"
            }`}
          >
            {uploading ? (
              <>
                <Loader2 className="size-10 mx-auto mb-4 animate-spin text-violet-400" />
                <p className="font-medium">Indexing your document…</p>
                <p className="text-xs text-zinc-500 mt-1">
                  Extracting text · chunking · embedding · storing
                </p>
              </>
            ) : (
              <>
                <div className="size-12 mx-auto mb-4 rounded-2xl bg-zinc-900 grid place-items-center">
                  <Upload className="size-5 text-zinc-300" />
                </div>
                <p className="font-medium">Drop a document to start</p>
                <p className="text-xs text-zinc-500 mt-1">PDF or .txt · click or drag &amp; drop</p>
              </>
            )}
          </div>
          {uploadError && (
            <p className="mt-3 text-sm text-red-400 text-center">{uploadError}</p>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.txt,application/pdf,text/plain"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />
          <div className="mt-8 grid gap-2 text-xs text-zinc-500">
            <Feature>Answers grounded in your document — no hallucination</Feature>
            <Feature>Cites the page each fact came from</Feature>
            <Feature>Powered by Gemini embeddings &amp; LLM, stored in Supabase pgvector</Feature>
          </div>
        </div>
      </main>
    );
  }

  // ---------- Loaded state: chat ----------
  return (
    <main className="flex-1 flex flex-col max-w-4xl w-full mx-auto px-4">
      <div className="flex items-center justify-between gap-3 py-3 border-b border-zinc-800/80">
        <div className="flex items-center gap-2 min-w-0">
          <FileText className="size-4 text-violet-400 shrink-0" />
          <span className="truncate text-sm font-medium">{doc.filename}</span>
          <span className="text-xs text-zinc-500 shrink-0 hidden sm:inline">
            · {doc.pages} {doc.pages === 1 ? "page" : "pages"} · {doc.chunks} chunks
          </span>
        </div>
        <button
          onClick={() => {
            setDoc(null);
            setMessages([]);
          }}
          className="text-xs text-zinc-400 hover:text-zinc-100 flex items-center gap-1 px-2 py-1 rounded-md hover:bg-zinc-900 transition"
        >
          <RefreshCw className="size-3" />
          New document
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto py-6 space-y-6">
        {messages.length === 0 && (
          <div className="text-center text-zinc-500 text-sm py-12">
            <Sparkles className="size-5 mx-auto mb-3 text-zinc-600" />
            <p>Ask anything about your document.</p>
            <p className="text-xs mt-2 text-zinc-600">
              Try: <em>"Summarize this in 3 bullets"</em> · <em>"What are the key concepts?"</em>
            </p>
          </div>
        )}
        {messages.map((m, i) => (
          <MessageView key={i} message={m} />
        ))}
        {sending && (
          <div className="flex items-center gap-2 text-sm text-zinc-400">
            <Loader2 className="size-4 animate-spin" />
            Searching the document…
          </div>
        )}
      </div>

      <div className="py-4 border-t border-zinc-800/80">
        <div className="flex gap-2 items-end">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            disabled={sending}
            rows={1}
            placeholder="Ask a question…"
            className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:border-violet-500 focus:outline-none disabled:opacity-50 resize-none max-h-32"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || sending}
            className="bg-violet-600 hover:bg-violet-500 disabled:bg-zinc-800 disabled:text-zinc-600 px-4 py-3 rounded-xl text-sm font-medium flex items-center gap-2 transition shrink-0"
          >
            <Send className="size-4" />
          </button>
        </div>
        <p className="text-[10px] text-zinc-600 mt-2 text-center">
          Answers come strictly from the uploaded document.
        </p>
      </div>
    </main>
  );
}

function MessageView({ message }: { message: Message }) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="bg-violet-600 px-4 py-2.5 rounded-2xl rounded-br-md max-w-[80%] shadow-lg shadow-violet-600/10">
          <p className="text-sm whitespace-pre-wrap">{message.content}</p>
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <div className="prose prose-invert prose-sm max-w-none prose-p:my-2 prose-ul:my-2 prose-ol:my-2 prose-headings:mt-3 prose-headings:mb-2">
        <ReactMarkdown>{message.content}</ReactMarkdown>
      </div>
      {message.sources && message.sources.length > 0 && (
        <details className="text-xs group">
          <summary className="text-zinc-500 cursor-pointer hover:text-zinc-300 select-none inline-flex items-center gap-1">
            <span className="group-open:hidden">▸</span>
            <span className="hidden group-open:inline">▾</span>
            {message.sources.length} sources retrieved
          </summary>
          <div className="mt-2 space-y-2">
            {message.sources.map((s, i) => (
              <div key={i} className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-3">
                <div className="flex items-center justify-between mb-1.5 text-zinc-500 text-[11px]">
                  <span>{s.page ? `Page ${s.page}` : "Chunk"}</span>
                  <span>similarity {s.score.toFixed(3)}</span>
                </div>
                <p className="text-zinc-300 leading-relaxed">{s.preview}…</p>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function Feature({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-violet-400 mt-0.5">•</span>
      <span>{children}</span>
    </div>
  );
}
