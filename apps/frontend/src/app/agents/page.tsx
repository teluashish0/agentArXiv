import { redirect } from "next/navigation";

export default async function AgentsPage() {
  redirect("/sign-in");
}
