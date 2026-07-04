import axios from "axios";

export type UploadProgressCallback = (
  uploadId: string,
  progress: number
) => void;

export type UploadStatusCallback = (
  uploadId: string,
  status: "uploaded" | "failed",
  error?: string
) => void;

export interface UploadCallbacks {
  onProgress: UploadProgressCallback;
  onStatus: UploadStatusCallback;
}

export async function processFileUpload(
  uploadId: string,
  file: File,
  callbacks: UploadCallbacks,
  projectId?: string
): Promise<any> {
  try {
    if (!projectId) {
      throw new Error("projectId is required for upload");
    }

    const formData = new FormData();
    formData.append("file", file);

    const response = await axios.post(`/api/projects/${projectId}/media`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
      onUploadProgress: (progressEvent) => {
        const percent = Math.round(
          (progressEvent.loaded * 100) / (progressEvent.total || 1)
        );
        callbacks.onProgress(uploadId, percent);
      },
    });

    const mediaAsset = response.data.mediaAsset;

    // Construct upload data to match expected shape
    const uploadData = {
      id: mediaAsset.id,
      fileName: mediaAsset.originalName,
      filePath: mediaAsset.r2Url,
      fileSize: file.size,
      contentType: file.type,
      metadata: { uploadedUrl: mediaAsset.r2Url },
      type: file.type.split("/")[0],
      method: "direct",
      origin: "user",
      status: "uploaded",
      isPreview: false,
      r2Url: mediaAsset.r2Url,
      thumbnailUrl: mediaAsset.thumbnailUrl,
    };

    callbacks.onStatus(uploadId, "uploaded");
    return uploadData;
  } catch (error: any) {
    const errMsg = error.response?.data?.details || error.response?.data?.error || error.message;
    callbacks.onStatus(uploadId, "failed", errMsg);
    throw error;
  }
}

export async function processUrlUpload(
  uploadId: string,
  url: string,
  callbacks: UploadCallbacks
): Promise<any[]> {
  try {
    // Start with 10% progress
    callbacks.onProgress(uploadId, 10);

    // Upload URL
    const { data: { uploads = [] } = {} } = await axios.post(
      "/api/uploads/url",
      {
        userId: "PJ1nkaufw0hZPyhN7bWCP",
        urls: [url]
      },
      {
        headers: { "Content-Type": "application/json" }
      }
    );

    // Update to 50% progress
    callbacks.onProgress(uploadId, 50);

    // Construct upload data from uploads array
    const uploadDataArray = uploads.map((uploadInfo: any) => ({
      fileName: uploadInfo.fileName,
      filePath: uploadInfo.filePath,
      fileSize: 0,
      contentType: uploadInfo.contentType,
      metadata: { originalUrl: uploadInfo.originalUrl },
      folder: uploadInfo.folder || null,
      type: uploadInfo.contentType.split("/")[0],
      method: "url",
      origin: "user",
      status: "uploaded",
      isPreview: false
    }));

    // Complete
    callbacks.onProgress(uploadId, 100);
    callbacks.onStatus(uploadId, "uploaded");
    return uploadDataArray;
  } catch (error) {
    callbacks.onStatus(uploadId, "failed", (error as Error).message);
    throw error;
  }
}

export async function processUpload(
  uploadId: string,
  upload: { file?: File; url?: string },
  callbacks: UploadCallbacks,
  projectId?: string
): Promise<any> {
  if (upload.file) {
    return await processFileUpload(uploadId, upload.file, callbacks, projectId);
  }
  if (upload.url) {
    return await processUrlUpload(uploadId, upload.url, callbacks);
  }
  callbacks.onStatus(uploadId, "failed", "No file or URL provided");
  throw new Error("No file or URL provided");
}
