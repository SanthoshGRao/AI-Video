"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogBody,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import useStore from "@/_designcombo/editor/store/use-store";
import { Download, Loader2, PlayCircle, Settings2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { useParams } from "next/navigation";
import { Compositor } from "@/lib/engine/compositor";
import { Muxer, ArrayBufferTarget } from "mp4-muxer";

export function ExportModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const params = useParams();
  const projectId = params?.project_id as string;
  const { trackItemsMap, size, fps: defaultFps, duration, background } = useStore();

  const [step, setStep] = useState<"config" | "rendering" | "success">("config");
  const [resolution, setResolution] = useState(`${size.width}x${size.height}`);
  const [fps, setFps] = useState(String(defaultFps));
  
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState("");
  const [downloadUrl, setDownloadUrl] = useState("");
  const [fileSize, setFileSize] = useState(0);
  
  const isCancelledRef = useRef(false);

  useEffect(() => {
    if (open && step !== "rendering") {
      setStep("config");
      setProgress(0);
      setStatusText("");
      setDownloadUrl("");
      isCancelledRef.current = false;
    }
  }, [open]);

  const handleStartExport = async () => {
    try {
      setStep("rendering");
      setProgress(0);
      setStatusText("Initializing encoder...");
      isCancelledRef.current = false;

      const [w, h] = resolution.split("x").map(Number);
      const renderFps = Number(fps);
      const totalFrames = Math.floor((duration / 1000) * renderFps);

      // We simulate an EditorElement array from trackItemsMap
      const activeItems = Object.values(trackItemsMap);

      // Setup MP4 Muxer
      const muxer = new Muxer({
        target: new ArrayBufferTarget(),
        video: {
          codec: "avc",
          width: w,
          height: h,
        },
        fastStart: "in-memory"
      });

      const videoEncoder = new VideoEncoder({
        output: (chunk, meta) => muxer.addVideoChunk(chunk, meta as any),
        error: (e) => {
          console.error(e);
          toast.error("VideoEncoder error: " + e.message);
        },
      });

      videoEncoder.configure({
        codec: "avc1.4D0032", // Main profile
        width: w,
        height: h,
        bitrate: 5_000_000,
        framerate: renderFps,
      });

      const offscreen = new OffscreenCanvas(w, h);
      const ctx = offscreen.getContext("2d");
      if (!ctx) throw new Error("Could not get OffscreenCanvas context");
      
      const compositor = new Compositor(ctx, w, h);

      for (let i = 0; i < totalFrames; i++) {
        if (isCancelledRef.current) {
          videoEncoder.close();
          throw new Error("Export cancelled");
        }

        const timeMs = (i / renderFps) * 1000;
        
        // Filter items for this frame
        const currentActiveItems = (activeItems as any[]).filter((item) => {
          const start = item.display?.from ?? 0;
          const end = item.display?.to ?? duration;
          return timeMs >= start && timeMs <= end;
        });

        await compositor.renderFrame(timeMs, currentActiveItems, background);
        
        const frame = new VideoFrame(offscreen, { timestamp: timeMs * 1000 });
        videoEncoder.encode(frame, { keyFrame: i % (renderFps * 2) === 0 });
        frame.close();

        // Update progress every few frames
        if (i % 10 === 0) {
          setProgress((i / totalFrames) * 100);
          setStatusText(`Rendering frame ${i} of ${totalFrames}...`);
          // Yield to main thread so UI updates
          await new Promise(r => setTimeout(r, 0)); 
        }
      }

      setStatusText("Finalizing video...");
      await videoEncoder.flush();
      muxer.finalize();

      const { buffer } = muxer.target;
      const blob = new Blob([buffer], { type: "video/mp4" });
      const url = URL.createObjectURL(blob);
      
      setDownloadUrl(url);
      setFileSize(blob.size);
      setStep("success");
      
    } catch (err: any) {
      if (err.message !== "Export cancelled") {
        toast.error("Failed to start export: " + err.message);
      }
      setStep("config");
    }
  };

  const handleCancel = () => {
    isCancelledRef.current = true;
    toast("Export cancelled");
  };

  return (
    <Dialog open={open} onOpenChange={(val) => {
      if (step === "rendering") {
        toast.warning("Please cancel the export before closing.");
        return;
      }
      onOpenChange(val);
    }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {step === "config" && "Export Video"}
            {step === "rendering" && "Rendering Video..."}
            {step === "success" && "Export Complete!"}
          </DialogTitle>
          <DialogDescription>
            {step === "config" && "Configure settings to render your video locally."}
            {step === "rendering" && "Please keep this tab open while WebCodecs renders your video."}
            {step === "success" && "Your video is ready to download."}
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          {step === "config" && (
            <div className="flex flex-col gap-4">
              <div className="grid gap-2">
                <Label>Resolution</Label>
                <Select value={resolution} onValueChange={setResolution}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1080x1920">1080x1920 (9:16)</SelectItem>
                    <SelectItem value="1920x1080">1920x1080 (16:9)</SelectItem>
                    <SelectItem value="1080x1080">1080x1080 (1:1)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label>Frame Rate (FPS)</Label>
                <Select value={fps} onValueChange={setFps}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="24">24 FPS (Cinematic)</SelectItem>
                    <SelectItem value="30">30 FPS (Standard)</SelectItem>
                    <SelectItem value="60">60 FPS (Smooth)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <p className="text-xs text-muted-foreground mt-2">
                <Settings2 className="inline w-3 h-3 mr-1" />
                Videos are rendered securely in your browser using WebCodecs hardware acceleration. 
              </p>
            </div>
          )}

          {step === "rendering" && (
            <div className="flex flex-col items-center justify-center py-8 gap-6">
              <div className="relative flex items-center justify-center w-24 h-24">
                <Loader2 className="w-16 h-16 text-primary animate-spin" />
                <span className="absolute text-sm font-bold">{Math.round(progress)}%</span>
              </div>
              
              <div className="w-full space-y-2 text-center">
                <Progress value={progress} className="w-full h-2" />
                <p className="text-sm text-muted-foreground animate-pulse">{statusText}</p>
              </div>
            </div>
          )}

          {step === "success" && (
            <div className="flex flex-col items-center justify-center py-6 gap-4">
              <div className="w-20 h-20 bg-green-100 dark:bg-green-900/30 text-green-600 rounded-full flex items-center justify-center mb-2">
                <PlayCircle className="w-10 h-10" />
              </div>
              <div className="text-center">
                <h3 className="font-medium text-lg">Video Rendered Successfully</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  File Size: {(fileSize / 1024 / 1024).toFixed(2)} MB
                </p>
              </div>
            </div>
          )}
        </DialogBody>

        <DialogFooter>
          {step === "config" && (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button onClick={handleStartExport}>Start Export</Button>
            </>
          )}
          {step === "rendering" && (
            <Button variant="destructive" className="w-full" onClick={handleCancel}>
              <XCircle className="w-4 h-4 mr-2" /> Cancel Render
            </Button>
          )}
          {step === "success" && (
            <>
              <Button variant="outline" onClick={() => setStep("config")}>Render Again</Button>
              <Button asChild>
                <a href={downloadUrl} download={`export-${Date.now()}.mp4`}>
                  <Download className="w-4 h-4 mr-2" /> Download Video
                </a>
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
