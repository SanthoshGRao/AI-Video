import { ContentStudioShell } from "@/components/content-studio/content-studio-shell";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function ContentStudioPage({ params }: PageProps) {
  const { id } = await params;
  return <ContentStudioShell projectId={id} />;
}
