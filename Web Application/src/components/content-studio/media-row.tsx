"use client";

import { useState } from "react";
import {
  Folder,
  FolderPlus,
  MoreVertical,
  Edit2,
  Trash2,
  Film,
  ImageIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatFileSize } from "@/lib/media/utils";
import type { FolderItem } from "@/lib/media/folder-types";
import { MEDIA_SELECTION_DND_TYPE, readMediaDragPayload } from "@/lib/media/drag-payload";
import type { MediaItem } from "@/components/content-studio/media-panel";

type FolderRowProps = {
  kind: "folder";
  folder: FolderItem;
  readOnly?: boolean;
  onNavigate: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onCreateSubfolder: (parentId: string) => void;
  onDropMediaIds: (folderId: string, mediaIds: string[]) => void;
};

type FileRowProps = {
  kind: "file";
  item: MediaItem;
  readOnly?: boolean;
  selected: boolean;
  onToggleSelect: (checked: boolean) => void;
  onCardClick: (mods: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }) => void;
  onDragStart: (e: React.DragEvent) => void;
  onRemove: (id: string) => void;
  onRename: (name: string) => void;
};

export function MediaRow(props: FolderRowProps | FileRowProps) {
  if (props.kind === "folder") return <FolderRow {...props} />;
  return <FileRow {...props} />;
}

function FolderRow({
  folder,
  readOnly,
  onNavigate,
  onRename,
  onDelete,
  onCreateSubfolder,
  onDropMediaIds,
}: FolderRowProps) {
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
    <div
      className={cn(
        "flex items-center gap-3 px-3 py-2 rounded-lg border border-slate-100 hover:bg-slate-50 cursor-pointer group",
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
      <Folder className="w-5 h-5 text-amber-500 shrink-0" />
      {isEditing ? (
        <input
          autoFocus
          type="text"
          className="flex-1 text-sm px-1.5 py-0.5 border rounded outline-none font-medium"
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
        <p className="flex-1 text-sm font-medium text-slate-800 truncate">{folder.name}</p>
      )}
      <p className="text-xs text-slate-400 shrink-0">
        {itemCount} item{itemCount === 1 ? "" : "s"}
      </p>
      {!readOnly && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="opacity-0 group-hover:opacity-100 p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-600 transition-opacity shrink-0"
              onClick={(e) => e.stopPropagation()}
              aria-label="Folder options"
            >
              <MoreVertical className="w-4 h-4" />
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
            <DropdownMenuItem onClick={() => onDelete(folder.id)} className="text-red-600">
              <Trash2 className="w-4 h-4 mr-2" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}

function FileRow({
  item,
  readOnly,
  selected,
  onToggleSelect,
  onCardClick,
  onDragStart,
  onRemove,
  onRename,
}: FileRowProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(item.originalName);

  const commitRename = () => {
    setIsEditing(false);
    if (editName.trim() && editName.trim() !== item.originalName) {
      onRename(editName.trim());
    } else {
      setEditName(item.originalName);
    }
  };

  return (
    <div
      className={cn(
        "flex items-center gap-3 px-3 py-2 rounded-lg border group",
        selected ? "bg-indigo-50 border-indigo-200" : "border-slate-100 hover:bg-slate-50"
      )}
      draggable={!readOnly}
      onDragStart={onDragStart}
      onClick={(e) => !isEditing && onCardClick({ shiftKey: e.shiftKey, ctrlKey: e.ctrlKey, metaKey: e.metaKey })}
    >
      {!readOnly && (
        <Checkbox
          checked={selected}
          onCheckedChange={(checked) => onToggleSelect(!!checked)}
          onClick={(e) => e.stopPropagation()}
        />
      )}
      {item.type === "VIDEO" ? (
        <Film className="w-4 h-4 text-slate-400 shrink-0" />
      ) : (
        <ImageIcon className="w-4 h-4 text-slate-400 shrink-0" />
      )}
      {isEditing ? (
        <input
          autoFocus
          type="text"
          className="flex-1 text-sm px-1.5 py-0.5 border rounded outline-none font-medium"
          value={editName}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => setEditName(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitRename();
            else if (e.key === "Escape") {
              setIsEditing(false);
              setEditName(item.originalName);
            }
          }}
        />
      ) : (
        <p
          className="flex-1 text-sm text-slate-800 truncate"
          onDoubleClick={(e) => {
            e.stopPropagation();
            if (!readOnly) setIsEditing(true);
          }}
        >
          {item.originalName}
        </p>
      )}
      <p className="text-xs text-slate-400 shrink-0">{formatFileSize(item.fileSizeBytes)}</p>
      {!readOnly && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove(item.id);
          }}
          className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-rose-50 shrink-0"
          aria-label="Remove file"
        >
          <Trash2 className="w-4 h-4 text-rose-600" />
        </button>
      )}
    </div>
  );
}
