"use client";

import { useState, useCallback, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Loader2,
  FileText,
  Image as ImageIcon,
  X,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { toast } from "@/components/ui/toast";
import { scanner as scannerApi, documents as documentsApi } from "@/lib/api";
import type { Document, DocumentPage } from "@/types";
import ScannerConfig from "@/components/scanner/scanner-config";
import type { ScanConfig } from "@/components/scanner/scanner-config";
import PreviewPanel from "@/components/scanner/preview-panel";
import type { ScannedPage } from "@/components/scanner/preview-panel";
import SaveDialog from "@/components/scanner/save-dialog";
import type { SaveFormat } from "@/components/scanner/save-dialog";

type TaskStatus = "idle" | "scanning" | "processing" | "completed" | "failed";

export default function ScanPage() {
  const [selectedScannerId, setSelectedScannerId] = useState("");
  const [scanConfig, setScanConfig] = useState<ScanConfig>({
    deviceId: "",
    resolution: 300,
    colorMode: "color",
    duplex: false,
    source: "flatbed",
    paperSize: "a4",
  });
  const [pages, setPages] = useState<ScannedPage[]>([]);
  const [taskStatus, setTaskStatus] = useState<TaskStatus>("idle");
  const [scanProgress, setScanProgress] = useState(0);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [saveFormat, setSaveFormat] = useState<SaveFormat>("pdf");
  const [saveProgress, setSaveProgress] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const {
    data: scannersData,
    isLoading: isScannersLoading,
    refetch: refetchScanners,
    isRefetching: isRefreshing,
  } = useQuery({
    queryKey: ["scanner-devices"],
    queryFn: () => scannerApi.getDevices(),
    select: (res) => res.data,
  });

  const scanners = scannersData || [];

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  const pollTaskStatus = useCallback(
    (id: string) => {
      stopPolling();
      pollingRef.current = setInterval(async () => {
        try {
          const res = await scannerApi.getStatus(id);
          const { status, progress, result } = res.data;

          setScanProgress(progress || 0);

          if (status === "completed" && result) {
            stopPolling();
            setTaskStatus("completed");
            setScanProgress(100);
            await loadDocumentPages(result);
            toast({
              title: "Scan completed",
              description: `${result.page_count || 1} pages scanned successfully`,
              variant: "success",
            });
          } else if (status === "failed") {
            stopPolling();
            setTaskStatus("failed");
            toast({
              title: "Scan failed",
              description: "The scanner encountered an error. Please try again.",
              variant: "destructive",
            });
          } else {
            setTaskStatus(
              status === "pending" || status === "processing"
                ? "processing"
                : "scanning"
            );
          }
        } catch {
          stopPolling();
          setTaskStatus("failed");
          toast({
            title: "Connection error",
            description: "Failed to check scan status",
            variant: "destructive",
          });
        }
      }, 1500);
    },
    [stopPolling]
  );

  const loadDocumentPages = async (doc: Document) => {
    try {
      const res = await documentsApi.getDocumentPages(doc.id);
      const docPages: DocumentPage[] = res.data;

      const scannedPages: ScannedPage[] = docPages.map((p) => ({
        id: p.id,
        imageUrl: p.image_url,
        thumbnailUrl: p.thumbnail_url,
        pageNumber: p.page_number,
        rotation: 0,
      }));

      setPages(scannedPages);
    } catch {
      toast({
        title: "Error loading pages",
        description: "Could not load scanned page previews",
        variant: "destructive",
      });
    }
  };

  const handleScan = async () => {
    if (!selectedScannerId) {
      toast({
        title: "No scanner selected",
        description: "Please select a scanner from the list",
        variant: "destructive",
      });
      return;
    }

    const selectedScanner = scanners.find(
      (s) => s.id === selectedScannerId
    );
    if (!selectedScanner) {
      toast({
        title: "Invalid scanner",
        description: "Selected scanner not found",
        variant: "destructive",
      });
      return;
    }

    setTaskStatus("scanning");
    setScanProgress(0);
    setPages([]);

    try {
      const res = await scannerApi.scan({
        device_id: selectedScanner.device_id,
        resolution: scanConfig.resolution,
        color_mode: scanConfig.colorMode,
        duplex: scanConfig.duplex,
        source: scanConfig.source,
      });

      const id = res.data.task_id;
      pollTaskStatus(id);

      toast({
        title: "Scan started",
        description: "Processing your scan request...",
      });
    } catch {
      setTaskStatus("failed");
      toast({
        title: "Scan failed",
        description: "Could not start the scan. Check scanner connection.",
        variant: "destructive",
      });
    }
  };

  const handleRotate = useCallback(
    (id: string | number, direction: "left" | "right") => {
      setPages((prev) =>
        prev.map((p) =>
          p.id === id
            ? {
                ...p,
                rotation:
                  direction === "right"
                    ? p.rotation + 90
                    : p.rotation - 90,
              }
            : p
        )
      );
    },
    []
  );

  const handleDelete = useCallback((id: string | number) => {
    setPages((prev) => {
      const filtered = prev.filter((p) => p.id !== id);
      return filtered.map((p, i) => ({ ...p, pageNumber: i + 1 }));
    });
  }, []);

  const handleReorder = useCallback(
    (id: string | number, direction: "up" | "down") => {
      setPages((prev) => {
        const idx = prev.findIndex((p) => p.id === id);
        if (idx === -1) return prev;
        if (direction === "up" && idx === 0) return prev;
        if (direction === "down" && idx === prev.length - 1) return prev;

        const next = [...prev];
        const swapIdx = direction === "up" ? idx - 1 : idx + 1;
        [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
        return next.map((p, i) => ({ ...p, pageNumber: i + 1 }));
      });
    },
    []
  );

  const handleSave = async (data: {
    title: string;
    folderId: number | null;
    format: SaveFormat;
  }) => {
    if (pages.length === 0) return;

    setIsSaving(true);
    setSaveProgress(0);

    try {
      const selectedScanner = scanners.find(
        (s) => s.id === selectedScannerId
      );

      if (data.format === "pdf") {
        const res = await scannerApi.scanPdf({
          device_id: selectedScanner?.device_id || "",
          resolution: scanConfig.resolution,
          color_mode: scanConfig.colorMode,
          duplex: scanConfig.duplex,
          source: scanConfig.source,
          document_title: data.title,
          folder_id: data.folderId,
        });

        const saveTaskId = res.data.task_id;
        await pollSaveTask(saveTaskId, data.title);
      } else {
        const res = await scannerApi.scanImages({
          device_id: selectedScanner?.device_id || "",
          resolution: scanConfig.resolution,
          color_mode: scanConfig.colorMode,
          duplex: scanConfig.duplex,
          source: scanConfig.source,
          format: data.format,
          document_title: data.title,
          folder_id: data.folderId,
        });

        const saveTaskId = res.data.task_id;
        await pollSaveTask(saveTaskId, data.title);
      }
    } catch {
      setIsSaving(false);
      toast({
        title: "Save failed",
        description: "Could not save the scanned document",
        variant: "destructive",
      });
    }
  };

  const pollSaveTask = (taskId: string, title: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      const interval = setInterval(async () => {
        try {
          const res = await scannerApi.getStatus(taskId);
          const { status, progress } = res.data;

          setSaveProgress(progress || 0);

          if (status === "completed") {
            clearInterval(interval);
            setIsSaving(false);
            setSaveDialogOpen(false);
            toast({
              title: "Document saved",
              description: `"${title}" has been saved successfully`,
              variant: "success",
            });
            resolve();
          } else if (status === "failed") {
            clearInterval(interval);
            setIsSaving(false);
            reject(new Error("Save task failed"));
          }
        } catch {
          clearInterval(interval);
          setIsSaving(false);
          reject(new Error("Failed to check save status"));
        }
      }, 1500);
    });
  };

  const handleCancel = () => {
    if (pages.length === 0) return;
    setPages([]);
    setTaskStatus("idle");
    setScanProgress(0);
    stopPolling();
    toast({
      title: "Scan cancelled",
      description: "All scanned pages have been discarded",
    });
  };

  const handleConfigChange = useCallback((config: ScanConfig) => {
    setScanConfig(config);
    if (config.deviceId) {
      setSelectedScannerId(config.deviceId);
    }
  }, []);

  const isScanActive =
    taskStatus === "scanning" || taskStatus === "processing";

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Scan Center</h1>
          <p className="text-sm text-muted-foreground">
            Digitize documents using network scanners
          </p>
        </div>
        {taskStatus === "completed" && pages.length > 0 && (
          <Badge variant="success" className="gap-1">
            <CheckCircle2 className="h-3.5 w-3.5" />
            {pages.length} pages scanned
          </Badge>
        )}
      </div>

      {isScanActive && (
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <div className="flex-1 space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">
                  {taskStatus === "scanning"
                    ? "Scanning document..."
                    : "Processing pages..."}
                </span>
                <span className="text-muted-foreground">{scanProgress}%</span>
              </div>
              <Progress value={scanProgress} />
            </div>
          </div>
        </Card>
      )}

      {taskStatus === "failed" && (
        <Card className="border-destructive/50 bg-destructive/5 p-4">
          <div className="flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-destructive" />
            <div className="flex-1">
              <p className="text-sm font-medium">Scan failed</p>
              <p className="text-xs text-muted-foreground">
                The scanner encountered an error. Please check the scanner
                connection and try again.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setTaskStatus("idle")}
            >
              Dismiss
            </Button>
          </div>
        </Card>
      )}

      <div className="grid flex-1 grid-cols-1 gap-4 lg:grid-cols-[320px_1fr]">
        <div className="h-full">
          <ScannerConfig
            scanners={scanners}
            selectedScannerId={selectedScannerId}
            onConfigChange={handleConfigChange}
            onScan={handleScan}
            isScanning={isScanActive}
            onRefreshScanners={() => refetchScanners()}
            isRefreshing={isRefreshing || isScannersLoading}
          />
        </div>

        <div className="flex h-full flex-col">
          <PreviewPanel
            pages={pages}
            onRotate={handleRotate}
            onDelete={handleDelete}
            onReorder={handleReorder}
          />
        </div>
      </div>

      {pages.length > 0 && (
        <div className="flex items-center justify-between rounded-lg border bg-card p-3 shadow-sm">
          <div className="flex items-center gap-3">
            <Badge variant="secondary" className="gap-1 px-3 py-1">
              <FileText className="h-3.5 w-3.5" />
              {pages.length} {pages.length === 1 ? "page" : "pages"}
            </Badge>
            <span className="text-xs text-muted-foreground">
              Ready to save
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCancel}
              disabled={isSaving}
            >
              <X className="mr-1.5 h-4 w-4" />
              Cancel
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSaveFormat("jpeg");
                setSaveDialogOpen(true);
              }}
              disabled={isSaving}
            >
              <ImageIcon className="mr-1.5 h-4 w-4" />
              Save as Images
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setSaveFormat("pdf");
                setSaveDialogOpen(true);
              }}
              disabled={isSaving}
            >
              <FileText className="mr-1.5 h-4 w-4" />
              Save as PDF
            </Button>
          </div>
        </div>
      )}

      <SaveDialog
        open={saveDialogOpen}
        onOpenChange={setSaveDialogOpen}
        onSave={handleSave}
        isSaving={isSaving}
        progress={saveProgress}
        pageCount={pages.length}
        defaultFormat={saveFormat}
      />
    </div>
  );
}
