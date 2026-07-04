"use client";

import React, { useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, UploadCloud } from "lucide-react";
import { useParams } from "next/navigation";

function genId() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `upload-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

interface ModalUploadProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export default function ModalUpload({ open, onOpenChange }: ModalUploadProps) {
  const params = useParams();
  const projectId = params?.id as string;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const uploadFiles = async (fileList: File[]) => {
    if (!projectId || fileList.length === 0) return;
    setUploading(true);
    try {
      for (const file of fileList) {
        const form = new FormData();
        form.append("file", file);
        form.append("id", genId());
        await fetch(`/api/projects/${projectId}/media`, {
          method: "POST",
          body: form,
        });
      }
    } catch (e) {
      console.error("Upload failed", e);
    } finally {
      setUploading(false);
      onOpenChange?.(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      void uploadFiles(Array.from(e.target.files));
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      void uploadFiles(Array.from(e.dataTransfer.files));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Upload Media</DialogTitle>
        </DialogHeader>
        <div 
          className="flex flex-col items-center justify-center border-2 border-dashed border-slate-300 rounded-lg p-12 bg-slate-50 hover:bg-slate-100 transition-colors cursor-pointer"
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          {uploading ? (
            <Loader2 className="w-12 h-12 text-indigo-400 mb-4 animate-spin" />
          ) : (
            <UploadCloud className="w-12 h-12 text-slate-400 mb-4" />
          )}
          <p className="text-sm font-medium text-slate-700">
            {uploading ? "Uploading..." : "Click or drag files to upload"}
          </p>
          <p className="text-xs text-slate-500 mt-1">Supports MP4, JPG, PNG, MP3</p>
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            multiple
            accept="video/*,image/*,audio/*"
            onChange={handleFileChange}
          />
        </div>
        <div className="flex justify-end mt-4">
          <Button variant="outline" onClick={() => onOpenChange?.(false)} disabled={uploading}>
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
