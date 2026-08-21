"use client";

import { useState } from "react";
import { Folder, FolderPlus, MoreVertical, Edit2, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { FolderItem } from "@/lib/media/folder-types";
import { MEDIA_SELECTION_DND_TYPE, readMediaDragPayload } from "@/lib/media/drag-payload";

export function FolderTile({
  folder,
  readOnly,
  onNavigate,
  onRename,
  onDelete,
  onCreateSubfolder,
  onDropMediaIds,
}: {
  folder: FolderItem;
  readOnly?: boolean;
  onNavigate: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onCreateSubfolder: (parentId: string) => void;
  onDropMediaIds: (folderId: string, mediaIds: string[]) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(folder.name);
  const [isDropTarget, setIsDropTarget] = useState(false);

  const itemCount = folder.mediaCount + folder.childFolderCount;

  const commitRename = () => {
    setIsEditing(false);
    if (editName.trim() && editName.trim() !== folder.name) {
      onRename(folder.id, editName.trim());
    } else {
      setEditName(folder.name);
    }
  };

  return (
    <Card
      className={cn(
        "overflow-hidden group shadow-sm cursor-pointer transition-colors",
        isDropTarget && "ring-2 ring-indigo-400 bg-indigo-50/60"
      )}
      onClick={() => !isEditing && onNavigate(folder.id)}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes(MEDIA_SELECTION_DND_TYPE)) return;
        e.preventDefault();
        setIsDropTarget(true);
      }}
      onDragLeave={() => setIsDropTarget(false)}
      onDrop={(e) => {
        setIsDropTarget(false);
        const payload = readMediaDragPayload(e.dataTransfer);
        if (payload) {
          e.preventDefault();
          onDropMediaIds(folder.id, payload.ids);
        }
      }}
    >
      <div className="aspect-video bg-amber-50 relative flex items-center justify-center">
        <Folder className="w-10 h-10 text-amber-400" fill="currentColor" fillOpacity={0.15} />
      </div>
      <div className="p-2 space-y-1">
        <div className="flex items-center justify-between gap-1 h-5">
          {isEditing ? (
            <input
              autoFocus
              type="text"
              className="text-[10px] w-full px-1 py-0.5 border rounded outline-none font-medium"
              value={editName}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => setEditName(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitRename();
                else if (e.key === "Escape") {
                  setIsEditing(false);
                  setEditName(folder.name);
                }
              }}
            />
          ) : (
            <p
              className="text-[10px] text-slate-700 truncate font-medium"
              title={folder.name}
            >
              {folder.name}
            </p>
          )}
          {!readOnly && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-600 transition-opacity shrink-0"
                  onClick={(e) => e.stopPropagation()}
                  aria-label="Folder options"
                >
                  <MoreVertical className="w-3 h-3" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                <DropdownMenuItem
                  onClick={() => {
                    setEditName(folder.name);
                    setIsEditing(true);
                  }}
                >
                  <Edit2 className="w-4 h-4 mr-2" />
                  Rename
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onCreateSubfolder(folder.id)}>
                  <FolderPlus className="w-4 h-4 mr-2" />
                  New sub-folder
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => onDelete(folder.id)}
                  className="text-red-600"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
        <p className="text-[10px] text-slate-400">
          {itemCount} item{itemCount === 1 ? "" : "s"}
        </p>
      </div>
    </Card>
  );
}
