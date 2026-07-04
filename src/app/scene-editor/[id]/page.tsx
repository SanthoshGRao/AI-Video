"use client";

import { use } from "react";
import { SceneEditor } from "@/components/scene-editor";

export default function SceneEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <SceneEditor projectId={id} />;
}
