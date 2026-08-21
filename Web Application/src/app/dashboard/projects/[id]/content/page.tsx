import prisma from "@/lib/db/prisma";
import { isSkitProject } from "@/lib/skit/project";
import { ContentStudioShell } from "@/components/content-studio/content-studio-shell";
import { SkitProjectShell } from "@/components/skit/skit-project-shell";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function ContentStudioPage({ params }: PageProps) {
  const { id } = await params;

  // Route skit projects to the conversation workflow. Only the `kind` is read
  // here for routing — ownership is enforced by the shell's data hooks/APIs.
  const project = await prisma.project
    .findUnique({ where: { id }, select: { propertyData: true } })
    .catch(() => null);

  if (isSkitProject(project?.propertyData)) {
    return <SkitProjectShell projectId={id} />;
  }

  return <ContentStudioShell projectId={id} />;
}
