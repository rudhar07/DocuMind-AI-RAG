// pdf-parse's index file does a debug-mode test-file load that would normally
// trip up webpack. We avoid that by setting `serverComponentsExternalPackages`
// in next.config.js, which tells Next to load pdf-parse from node_modules at
// runtime instead of bundling it.
import pdfParse from "pdf-parse";

export type ParsedPage = { page: number; text: string };

/**
 * Parse a PDF buffer into per-page text. Page-level granularity lets us cite
 * the exact page each retrieved chunk came from.
 */
export async function parsePdf(buffer: Buffer): Promise<ParsedPage[]> {
  const pages: ParsedPage[] = [];
  let pageNumber = 0;

  const renderPage = (pageData: any) => {
    pageNumber++;
    const myPage = pageNumber;
    return pageData
      .getTextContent({ normalizeWhitespace: true, disableCombineTextItems: false })
      .then((textContent: any) => {
        const text = textContent.items.map((item: any) => item.str).join(" ");
        pages.push({ page: myPage, text });
        return text;
      });
  };

  await pdfParse(buffer, { pagerender: renderPage });
  return pages;
}
