import { Bot, Brain, Briefcase, Calendar, Headset, Kanban, Megaphone, PenTool, Search, Share2, TrendingUp, Wallet, Workflow, type LucideIcon } from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  bot: Bot, brain: Brain, briefcase: Briefcase, calendar: Calendar, headset: Headset, kanban: Kanban, megaphone: Megaphone,
  "pen-tool": PenTool, search: Search, "share-2": Share2, "trending-up": TrendingUp, wallet: Wallet, workflow: Workflow,
};
const COLORS: Record<string, string> = {
  cyan: "#22d3ee", blue: "#3b82f6", violet: "#8b5cf6", pink: "#ec4899", sky: "#38bdf8", emerald: "#10b981", amber: "#f59e0b",
  indigo: "#6366f1", teal: "#14b8a6", rose: "#f43f5e", orange: "#f97316", fuchsia: "#d946ef",
};
export const AGENT_ICON_NAMES = Object.keys(ICONS);
export const AGENT_COLORS = Object.keys(COLORS);

export function AgentIcon({ icon, color, size = "md" }: { icon: string; color: string; size?: "md" | "lg" }) {
  const I = ICONS[icon] ?? Bot;
  const c = COLORS[color] ?? COLORS.cyan;
  return (
    <span className={`grid shrink-0 place-items-center rounded-lg border ${size === "lg" ? "size-12" : "size-9"}`} style={{ borderColor: `${c}66`, background: `${c}1a`, color: c }}>
      <I className={size === "lg" ? "size-6" : "size-4"} />
    </span>
  );
}
