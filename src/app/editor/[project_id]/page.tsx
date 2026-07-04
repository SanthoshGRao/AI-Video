import { notFound, redirect } from "next/navigation";
import { getOrCreateDbUser } from "@/lib/auth/user";
import { getEditorBootstrap } from "@/lib/editor-v2/bootstrap";
import EditorClient from "./editor-client";

// Force dynamic rendering — auth + DB lookup per request.
export const dynamic = "force-dynamic";

export default async function EditorPage({
  params,
}: {
  params: Promise<{ project_id: string }>;
}) {
  const { project_id } = await params;
  const user = await getOrCreateDbUser();
  if (!user) redirect("/sign-in");

  const bootstrap = await getEditorBootstrap(project_id, user.id);
  if (!bootstrap) notFound();

  return <EditorClient projectId={project_id} bootstrap={bootstrap} />;
}
