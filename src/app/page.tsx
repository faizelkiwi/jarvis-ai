import { redirect } from "next/navigation";
import { currentUser } from "@/server/http";

export const dynamic = "force-dynamic";

export default async function Home() {
  redirect((await currentUser()) ? "/dashboard" : "/login");
}
