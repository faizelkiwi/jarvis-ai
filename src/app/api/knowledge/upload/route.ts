import { KNOWLEDGE_KINDS, type KnowledgeKind } from "@/server/db/schema";
import { addKnowledge } from "@/server/knowledge/service";
import { extractText, MAX_UPLOAD_BYTES, UnsupportedFileError } from "@/server/knowledge/extract";
import { audit } from "@/server/audit/log";
import { HttpError, route } from "@/server/http";

export const runtime = "nodejs";

export const POST = route({ role: "operator", limit: [30, 300] }, async ({ req, user }) => {
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > MAX_UPLOAD_BYTES + 100_000) throw new HttpError(413, "File exceeds the 10 MB limit");
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw new HttpError(400, "No file uploaded");
  const kindRaw = String(form.get("kind") ?? "document");
  const kind = (KNOWLEDGE_KINDS as readonly string[]).includes(kindRaw) ? (kindRaw as KnowledgeKind) : "document";
  const category = String(form.get("category") ?? "general").slice(0, 100) || "general";
  const name = file.name.replace(/[^\w.\- ()]/g, "_").slice(0, 200);
  try {
    const { text, mimeType } = await extractText(name, Buffer.from(await file.arrayBuffer()));
    if (!text) throw new HttpError(422, "No readable text found in the file (scanned PDFs need OCR first).");
    const doc = await addKnowledge({
      title: String(form.get("title") || name).slice(0, 300),
      content: text,
      category,
      kind,
      source: "upload",
      fileName: name,
      mimeType,
      sizeBytes: file.size,
      createdBy: user.id,
    });
    await audit({ actorType: "user", actorId: user.id, action: "knowledge.uploaded", entityType: "knowledge", entityId: doc.id, details: { fileName: name, size: file.size } });
    return { document: { id: doc.id, title: doc.title, chars: text.length } };
  } catch (e) {
    if (e instanceof UnsupportedFileError) throw new HttpError(415, e.message);
    throw e;
  }
});
