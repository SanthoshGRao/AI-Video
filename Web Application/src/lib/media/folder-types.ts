export interface FolderItem {
  id: string;
  name: string;
  description?: string | null;
  parentFolderId: string | null;
  mediaCount: number;
  childFolderCount: number;
}
