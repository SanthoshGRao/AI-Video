import { serializeAudioAsset, serializeMediaAsset } from "./serialize";

export function serializeProjectWithAssets<T extends {
  id: string;
  audioAssets?: Array<{
    id: string;
    projectId: string;
    localPath?: string | null;
    r2Url: string;
    r2Key: string;
  }>;
  mediaAssets?: Array<{
    id: string;
    projectId: string;
    localPath?: string | null;
    r2Url: string;
    r2Key: string;
  }>;
}>(project: T): T {
  return {
    ...project,
    audioAssets: project.audioAssets?.map((a) => serializeAudioAsset(a)),
    mediaAssets: project.mediaAssets?.map((m) => serializeMediaAsset(m)),
  };
}
