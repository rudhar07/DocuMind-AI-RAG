import Chat from "@/components/Chat";

export default function Home() {
  return (
    <>
      <header className="border-b border-zinc-800/80 backdrop-blur sticky top-0 z-10 bg-zinc-950/80">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
          {/* SVG logo — vector, scales perfectly at any size */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.svg"
            alt="DocuMind AI logo"
            className="size-11 shadow-lg shadow-fuchsia-500/20 flex-shrink-0"
          />
          <div className="flex-1">
            <h1 className="font-semibold leading-tight">DocuMind AI</h1>
            <p className="text-xs text-zinc-400 leading-tight">Chat with any document, grounded in its content.</p>
          </div>
          <a
            href="https://github.com/rudhar07/DocuMind-AI-RAG"
            target="_blank"
            rel="noreferrer"
            className="text-xs text-zinc-400 hover:text-zinc-100 hidden sm:inline"
          >
            GitHub →
          </a>
        </div>
      </header>
      <Chat />
    </>
  );
}
