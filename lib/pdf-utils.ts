import pdfParse from 'pdf-parse-fork';

export interface ParsedParagraph {
  idx: number;
  text: string;
}

export interface ParsedPage {
  page: number;
  text: string;
  paragraphs: ParsedParagraph[];
}

export interface ParsedPdf {
  pageCount: number;
  pages: ParsedPage[];
}

/**
 * Fetch a PDF from a URL and parse it into pages and paragraphs with
 * stable indices, suitable for citation-style references.
 */
export async function fetchAndParsePdf(url: string): Promise<ParsedPdf> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch PDF (${res.status} ${res.statusText})`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  const data = await pdfParse(buffer);

  // pdf-parse joins pages with the form-feed character (\f).
  const pageTexts: string[] = data.text.split('\f');

  const pages: ParsedPage[] = pageTexts.map((pageText, i) => {
    const paragraphs: ParsedParagraph[] = pageText
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0)
      .map((text, idx) => ({ idx: idx + 1, text }));

    return {
      page: i + 1,
      text: pageText,
      paragraphs,
    };
  });

  return {
    pageCount: data.numpages,
    pages,
  };
}``