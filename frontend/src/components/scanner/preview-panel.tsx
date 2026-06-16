"use client";

import { useState } from "react";
import {
  RotateCw,
  RotateCcw,
  Trash2,
  ChevronUp,
  ChevronDown,
  ImageOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

export interface ScannedPage {
  id: string | number;
  imageUrl?: string;
  thumbnailUrl?: string;
  pageNumber: number;
  rotation: number;
}

interface PreviewPanelProps {
  pages: ScannedPage[];
  onRotate: (id: string | number, direction: "left" | "right") => void;
  onDelete: (id: string | number) => void;
  onReorder: (id: string | number, direction: "up" | "down") => void;
}

function getRotationStyle(rotation: number): React.CSSProperties {
  const normalized = ((rotation % 360) + 360) % 360;
  return {
    transform: `rotate(${normalized}deg)`,
    transition: "transform 0.2s ease-in-out",
  };
}

function PageThumbnail({
  page,
  isSelected,
  onSelect,
  onRotate,
  onDelete,
  onReorder,
  totalPages,
}: {
  page: ScannedPage;
  isSelected: boolean;
  onSelect: () => void;
  onRotate: (id: string | number, direction: "left" | "right") => void;
  onDelete: (id: string | number) => void;
  onReorder: (id: string | number, direction: "up" | "down") => void;
  totalPages: number;
}) {
  return (
    <div
      className={`group relative flex w-24 shrink-0 flex-col items-center gap-1 rounded-lg border p-1.5 transition-all ${
        isSelected
          ? "border-primary bg-primary/5 shadow-sm ring-1 ring-primary"
          : "border-border hover:border-muted-foreground/30 hover:bg-accent/50"
      }`}
    >
      <button
        type="button"
        className="flex w-full flex-col items-center gap-1"
        onClick={onSelect}
      >
        <div className="relative flex aspect-[3/4] w-full items-center justify-center overflow-hidden rounded-md bg-muted">
          {page.imageUrl || page.thumbnailUrl ? (
            <img
              src={page.thumbnailUrl || page.imageUrl}
              alt={`Page ${page.pageNumber}`}
              className="h-full w-full object-contain"
              style={getRotationStyle(page.rotation)}
              draggable={false}
            />
          ) : (
            <ImageOff className="h-5 w-5 text-muted-foreground/50" />
          )}
        </div>
        <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
          {page.pageNumber}
        </Badge>
      </button>

      <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={(e) => {
            e.stopPropagation();
            onRotate(page.id, "left");
          }}
        >
          <RotateCcw className="h-3 w-3" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={(e) => {
            e.stopPropagation();
            onRotate(page.id, "right");
          }}
        >
          <RotateCw className="h-3 w-3" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-destructive hover:text-destructive"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(page.id);
          }}
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>

      {totalPages > 1 && (
        <div className="absolute -right-2.5 top-1/2 flex -translate-y-1/2 flex-col gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          <Button
            variant="outline"
            size="icon"
            className="h-5 w-5"
            onClick={(e) => {
              e.stopPropagation();
              onReorder(page.id, "up");
            }}
            disabled={page.pageNumber <= 1}
          >
            <ChevronUp className="h-3 w-3" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-5 w-5"
            onClick={(e) => {
              e.stopPropagation();
              onReorder(page.id, "down");
            }}
            disabled={page.pageNumber >= totalPages}
          >
            <ChevronDown className="h-3 w-3" />
          </Button>
        </div>
      )}
    </div>
  );
}

export default function PreviewPanel({
  pages,
  onRotate,
  onDelete,
  onReorder,
}: PreviewPanelProps) {
  const [selectedId, setSelectedId] = useState<string | number | null>(null);

  const selectedPage = selectedId
    ? pages.find((p) => p.id === selectedId)
    : pages[pages.length - 1] || null;

  if (pages.length === 0) {
    return (
      <Card className="flex h-full items-center justify-center p-12">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="rounded-full bg-muted p-4">
            <ImageOff className="h-8 w-8 text-muted-foreground" />
          </div>
          <div>
            <p className="text-lg font-medium">No scanned pages</p>
            <p className="text-sm text-muted-foreground">
              Configure the scanner and start a scan to preview pages here.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex flex-1 items-center justify-center overflow-hidden rounded-lg border bg-muted/20 p-4">
        {selectedPage ? (
          <div className="relative flex max-h-full max-w-full items-center justify-center">
            {selectedPage.imageUrl ? (
              <img
                src={selectedPage.imageUrl}
                alt={`Page ${selectedPage.pageNumber}`}
                className="max-h-[70vh] max-w-full rounded-md object-contain shadow-md"
                style={getRotationStyle(selectedPage.rotation)}
                draggable={false}
              />
            ) : (
              <div className="flex h-64 w-48 items-center justify-center rounded-md bg-muted">
                <ImageOff className="h-8 w-8 text-muted-foreground" />
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <ImageOff className="h-8 w-8" />
            <p className="text-sm">Select a page to preview</p>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {pages.length} {pages.length === 1 ? "page" : "pages"}
        </p>
        {selectedPage && (
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1 text-xs"
              onClick={() => onRotate(selectedPage.id, "left")}
            >
              <RotateCcw className="h-3 w-3" />
              Rotate Left
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1 text-xs"
              onClick={() => onRotate(selectedPage.id, "right")}
            >
              <RotateCw className="h-3 w-3" />
              Rotate Right
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1 text-xs text-destructive hover:text-destructive"
              onClick={() => {
                onDelete(selectedPage.id);
                setSelectedId(null);
              }}
            >
              <Trash2 className="h-3 w-3" />
              Delete
            </Button>
          </div>
        )}
      </div>

      <div className="flex gap-2 overflow-x-auto pb-2">
        {pages.map((page) => (
          <PageThumbnail
            key={page.id}
            page={page}
            isSelected={selectedId === page.id}
            onSelect={() => setSelectedId(page.id)}
            onRotate={onRotate}
            onDelete={onDelete}
            onReorder={onReorder}
            totalPages={pages.length}
          />
        ))}
      </div>
    </div>
  );
}
