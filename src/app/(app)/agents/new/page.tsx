import { getDb } from "@/server/db/client";
import { agents, projects } from "@/server/db/schema";
import { ASSIGNABLE_TOOLS } from "@/server/agents/tools";
import { requireUser } from "@/server/http";
import { AgentForm } from "@/components/agent-form";
import { PageHeader } from "@/components/ui";

export default async function NewAgentPage() {
  await requireUser("admin");
  const db = await getDb();
  const [roster, projs] = await Promise.all([db.select({ slug: agents.slug, name: agents.name }).from(agents), db.select({ id: projects.id, name: projects.name }).from(projects)]);
  return (
    <div className="max-w-4xl">
      <PageHeader title="New agent" subtitle="Define a new specialist. It becomes available to JARVIS for delegation immediately." />
      <div className="panel p-4">
        <AgentForm
          canEdit
          tools={ASSIGNABLE_TOOLS}
          agents={roster}
          projects={projs}
          projectIds={[]}
          initial={{ slug: "", name: "", title: "Specialist", description: "", responsibilities: [], systemPrompt: "You are a specialised agent inside JARVIS.\n\nYour responsibilities:\n- ", provider: null, model: null, effort: null, active: true, permissions: ["search_knowledge", "save_memory", "get_business_profile"], canDelegateTo: [], knowledgeScopes: ["*"], color: "cyan", icon: "bot" }}
        />
      </div>
    </div>
  );
}
