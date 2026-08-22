import { ProjectLockBanner } from "@/components/workspace/project-lock-banner";

/**
 * Wraps every per-project page (content, media, editor, subtitles, export) so
 * the presence banner follows the project rather than being bolted onto each
 * screen. It renders nothing unless a teammate is actually holding the lock.
 */
export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <>
      <ProjectLockBanner projectId={id} />
      {children}
    </>
  );
}
