import { IDesign } from "@designcombo/types";
import { create } from "zustand";
interface Output {
  url: string;
  type: string;
}

interface DownloadState {
  projectId: string;
  exporting: boolean;
  exportType: "json" | "mp4";
  progress: number;
  output?: Output;
  payload?: IDesign;
  displayProgressModal: boolean;
  actions: {
    setProjectId: (projectId: string) => void;
    setExporting: (exporting: boolean) => void;
    setExportType: (exportType: "json" | "mp4") => void;
    setProgress: (progress: number) => void;
    setState: (state: Partial<DownloadState>) => void;
    setOutput: (output: Output) => void;
    startExport: () => void;
    setDisplayProgressModal: (displayProgressModal: boolean) => void;
  };
}

//const baseUrl = "https://api.combo.sh/v1";

export const useDownloadState = create<DownloadState>((set, get) => ({
  projectId: "",
  exporting: false,
  exportType: "mp4",
  progress: 0,
  displayProgressModal: false,
  actions: {
    setProjectId: (projectId) => set({ projectId }),
    setExporting: (exporting) => set({ exporting }),
    setExportType: (exportType) => set({ exportType }),
    setProgress: (progress) => set({ progress }),
    setState: (state) => set({ ...state }),
    setOutput: (output) => set({ output }),
    setDisplayProgressModal: (displayProgressModal) =>
      set({ displayProgressModal }),
    startExport: async () => {
      try {
        // Set exporting to true at the start
        set({ exporting: true, displayProgressModal: true });

        // Assume payload to be stored in the state for POST request
        const { payload } = get();

        if (!payload) throw new Error("Payload is not defined");

        // Step 1: POST request to start rendering
        const projectId = get().projectId;
        if (!projectId) throw new Error("Project ID is not defined");

        const response = await fetch(`/api/projects/${projectId}/export`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            resolution: "1080p",
            subtitleBurnIn: true
          })
        });

        if (!response.ok) throw new Error("Failed to submit export request.");

        const jobInfo = await response.json();
        const jobId = jobInfo.job.id;

        // Step 2 & 3: Polling for status updates
        const checkStatus = async () => {
          const statusResponse = await fetch(`/api/projects/${projectId}/export/${jobId}`, {
            headers: {
              "Content-Type": "application/json"
            }
          });

          if (!statusResponse.ok)
            throw new Error("Failed to fetch export status.");

          const statusInfo = await statusResponse.json();
          const { status, renderProgress: progress, downloadUrl: url, errorMessage } = statusInfo.job;

          set({ progress });

          if (status === "DONE") {
            set({ exporting: false, output: { url, type: get().exportType } });
          } else if (status === "FAILED") {
            throw new Error(errorMessage || "Export failed");
          } else if (status === "RENDERING") {
            setTimeout(checkStatus, 2500);
          }
        };

        checkStatus();
      } catch (error) {
        console.error(error);
        set({ exporting: false, displayProgressModal: false, progress: 0 });
      }
    }
  }
}));
