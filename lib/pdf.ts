// Use the inner path of pdf-parse to skip the package's debug-mode test-file load,
// which trips up bundlers when the file is ingested by webpack.
import pdfParse from "pdf-parse/lib/pdf-parse.js";

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
