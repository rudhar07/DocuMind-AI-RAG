import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DocuMind AI — Chat with your documents",
  description:
    "Upload any PDF or text document and have a grounded conversation with it. Built with Gemini, Hugging Face embeddings, and Qdrant.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-zinc-950 text-zinc-100 antialiased min-h-screen flex flex-col">
        {children}
      </body>
    </html>
  );
}
