export type UploadedMediaAsset = {
  id: string;
  type: string;
  originalName: string;
  r2Url: string;
  thumbnailUrl?: string | null;
  mimeType: string;
  fileSizeBytes: number;
};

export function uploadProjectMedia(
  projectId: string,
  file: File,
  onProgress?: (percent: number) => void
): Promise<{ mediaAsset: UploadedMediaAsset }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const fd = new FormData();
    fd.append("file", file);

    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    });

    xhr.addEventListener("load", () => {
      let json: { error?: string; mediaAsset?: UploadedMediaAsset } = {};
      const raw = xhr.responseText?.trim();
      if (raw) {
        try {
          json = JSON.parse(raw) as typeof json;
        } catch {
          reject(new Error(`Invalid server response (${xhr.status})`));
          return;
        }
      }
      if (xhr.status >= 200 && xhr.status < 300 && json.mediaAsset) {
        resolve({ mediaAsset: json.mediaAsset });
        return;
      }
      reject(new Error(json.error || `Upload failed (${xhr.status})`));
    });

    xhr.addEventListener("error", () => reject(new Error("Network error")));
    xhr.addEventListener("abort", () => reject(new Error("Upload cancelled")));

    xhr.open("POST", `/api/projects/${projectId}/media`);
    xhr.send(fd);
  });
}

export function uploadGlobalMedia(
  file: File,
  onProgress?: (percent: number) => void
): Promise<{ mediaAsset: UploadedMediaAsset }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const fd = new FormData();
    fd.append("file", file);

    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    });

    xhr.addEventListener("load", () => {
      let json: { error?: string; mediaAsset?: UploadedMediaAsset } = {};
      const raw = xhr.responseText?.trim();
      if (raw) {
        try {
          json = JSON.parse(raw) as typeof json;
        } catch {
          reject(new Error(`Invalid server response (${xhr.status})`));
          return;
        }
      }
      if (xhr.status >= 200 && xhr.status < 300 && json.mediaAsset) {
        resolve({ mediaAsset: json.mediaAsset });
        return;
      }
      reject(new Error(json.error || `Upload failed (${xhr.status})`));
    });

    xhr.addEventListener("error", () => reject(new Error("Network error")));
    xhr.addEventListener("abort", () => reject(new Error("Upload cancelled")));

    xhr.open("POST", `/api/media/upload/global`);
    xhr.send(fd);
  });
}
