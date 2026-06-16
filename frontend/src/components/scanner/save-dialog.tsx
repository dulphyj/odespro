"use client";

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Save,
  Loader2,
  FolderTree,
  FileText,
  Image as ImageIcon,
  FileImage,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { folders as foldersApi } from "@/lib/api";
import type { Folder } from "@/types";

export type SaveFormat = "pdf" | "jpeg" | "png" | "tiff";

interface SaveDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (data: {
    title: string;
    folderId: number | null;
    format: SaveFormat;
  }) => void;
  isSaving: boolean;
  progress: number;
  pageCount: number;
  defaultFormat?: SaveFormat;
}

function buildFolderTree(folders: Folder[]): Folder[] {
  const map = new Map<number, Folder>();
  const roots: Folder[] = [];

  for (const f of folders) {
    map.set(f.id, { ...f, children: [] });
  }

  for (const f of map.values()) {
    if (f.parent_id && map.has(f.parent_id)) {
      const parent = map.get(f.parent_id)!;
      parent.children = parent.children || [];
      parent.children.push(f);
    } else {
      roots.push(f);
    }
  }

  return roots;
}

function FolderOption({
  folder,
  depth = 0,
}: {
  folder: Folder;
  depth?: number;
}) {
  const label =
    depth === 0 ? folder.name : `${"\u00A0".repeat(depth * 4)}${folder.name}`;

  return (
    <>
      <SelectItem key={folder.id} value={String(folder.id)}>
        <span style={{ paddingLeft: `${depth * 16}px` }}>{label}</span>
      </SelectItem>
      {folder.children?.map((child) => (
        <FolderOption key={child.id} folder={child} depth={depth + 1} />
      ))}
    </>
  );
}

export default function SaveDialog({
  open,
  onOpenChange,
  onSave,
  isSaving,
  progress,
  pageCount,
  defaultFormat,
}: SaveDialogProps) {
  const [title, setTitle] = useState("");
  const [folderId, setFolderId] = useState<string>("none");
  const [format, setFormat] = useState<SaveFormat>("pdf");

  const { data: foldersData } = useQuery({
    queryKey: ["folders-tree"],
    queryFn: () => foldersApi.getFolderTree(),
    enabled: open,
    select: (res) => res.data,
  });

  const folderTree = foldersData ? buildFolderTree(foldersData) : [];

  useEffect(() => {
    if (open) {
      setTitle("");
      setFolderId("none");
      setFormat(defaultFormat || "pdf");
    }
  }, [open, defaultFormat]);

  const handleSave = () => {
    onSave({
      title: title.trim() || "Scanned Document",
      folderId: folderId === "none" ? null : Number(folderId),
      format,
    });
  };

  const isValid = title.trim().length > 0 || pageCount > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Save Scanned Document</DialogTitle>
          <DialogDescription>
            Choose a destination folder and document title for your {pageCount}{" "}
            scanned {pageCount === 1 ? "page" : "pages"}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="doc-title">Document Title</Label>
            <Input
              id="doc-title"
              placeholder="Scanned Document"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={isSaving}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="doc-folder">Destination Folder</Label>
            <Select
              value={folderId}
              onValueChange={setFolderId}
              disabled={isSaving}
            >
              <SelectTrigger id="doc-folder">
                <SelectValue placeholder="Select folder..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">
                  <span className="flex items-center gap-2">
                    <FolderTree className="h-3.5 w-3.5" />
                    No folder (root)
                  </span>
                </SelectItem>
                {folderTree.map((folder) => (
                  <FolderOption key={folder.id} folder={folder} />
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="doc-format">Save Format</Label>
            <Select
              value={format}
              onValueChange={(v) => setFormat(v as SaveFormat)}
              disabled={isSaving}
            >
              <SelectTrigger id="doc-format">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pdf">
                  <span className="flex items-center gap-2">
                    <FileText className="h-3.5 w-3.5" />
                    PDF Document
                  </span>
                </SelectItem>
                <SelectItem value="jpeg">
                  <span className="flex items-center gap-2">
                    <ImageIcon className="h-3.5 w-3.5" />
                    JPEG Images
                  </span>
                </SelectItem>
                <SelectItem value="png">
                  <span className="flex items-center gap-2">
                    <ImageIcon className="h-3.5 w-3.5" />
                    PNG Images
                  </span>
                </SelectItem>
                <SelectItem value="tiff">
                  <span className="flex items-center gap-2">
                    <FileImage className="h-3.5 w-3.5" />
                    TIFF Images
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isSaving && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Saving...</span>
                <span className="font-medium">{progress}%</span>
              </div>
              <Progress value={progress} />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
          >
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!isValid || isSaving}>
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Save
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
