/**
 * Safe text extraction for uploaded knowledge files.
 * Whitelisted types only; content is treated as untrusted data downstream.
 */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

const TEXT_TYPES: Record<string, string> = {
  ".txt": "text/plain",
  ".md": "text/markdown",
  ".markdown": "text/markdown",
  ".csv": "text/csv",
  ".tsv": "text/tab-separated-values",
  ".json": "application/json",
  ".html": "text/html",
  ".htm": "text/html",
};

export const ACCEPTED_EXTENSIONS = [...Object.keys(TEXT_TYPES), ".pdf"];

export class UnsupportedFileError extends Error {}

function ext(name: string) {
  const m = name.toLowerCase().match(/\.[a-z0-9]+$/);
  return m ? m[0] : "";
}

export async function extractText(fileName: string, data: Buffer): Promise<{ text: string; mimeType: string }> {
  if (data.length > MAX_UPLOAD_BYTES) throw new UnsupportedFileError("File exceeds the 10 MB limit");
  const e = ext(fileName);
  if (e === ".pdf") {
    if (data.subarray(0, 5).toString("latin1") !== "%PDF-") throw new UnsupportedFileError("File is not a valid PDF");
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: new Uint8Array(data) });
    try {
      const result = await parser.getText();
      return { text: result.text.trim(), mimeType: "application/pdf" };
    } finally {
      await parser.destroy();
    }
  }
  const mime = TEXT_TYPES[e];
  if (!mime) throw new UnsupportedFileError(`Unsupported file type "${e || "unknown"}". Accepted: ${ACCEPTED_EXTENSIONS.join(", ")}`);
  if (data.includes(0)) throw new UnsupportedFileError("Binary content detected in a text file");
  let text = data.toString("utf8");
  if (mime === "text/html") {
    text = text
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/[ \t]+/g, " ");
  }
  return { text: text.trim(), mimeType: mime };
}

/** Paragraph-aware chunking with overlap. */
export function chunkText(text: string, size = 1200, overlap = 200): string[] {
  const clean = text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!clean) return [];
  if (clean.length <= size) return [clean];
  const paras = clean.split(/\n\n/);
  const chunks: string[] = [];
  let cur = "";
  for (const p of paras) {
    if ((cur + "\n\n" + p).length > size && cur) {
      chunks.push(cur.trim());
      cur = cur.slice(Math.max(0, cur.length - overlap)) + "\n\n" + p;
    } else cur = cur ? cur + "\n\n" + p : p;
    while (cur.length > size * 1.5) {
      chunks.push(cur.slice(0, size).trim());
      cur = cur.slice(size - overlap);
    }
  }
  if (cur.trim()) chunks.push(cur.trim());
  return chunks;
}
