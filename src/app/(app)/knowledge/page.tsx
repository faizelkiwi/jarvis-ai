import { listKnowledge } from "@/server/knowledge/service";
import { activeEmbeddingModel } from "@/server/knowledge/embeddings";
import { ACCEPTED_EXTENSIONS } from "@/server/knowledge/extract";
import { requireUser } from "@/server/http";
import { KnowledgeUI } from "./ui";

export default async function KnowledgePage() {
  const user = await requireUser();
  const [docs, model] = await Promise.all([listKnowledge({ limit: 500 }), activeEmbeddingModel()]);
  return <KnowledgeUI docs={JSON.parse(JSON.stringify(docs))} embeddingModel={model} accept={ACCEPTED_EXTENSIONS.join(",")} canEdit={user.role !== "viewer"} canDelete={["owner", "admin"].includes(user.role)} />;
}
