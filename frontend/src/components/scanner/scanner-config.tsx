"use client";

import { useState, useEffect, useCallback } from "react";
import { RefreshCw, Scan, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import type { Scanner } from "@/types";

export type ColorMode = "color" | "grayscale" | "black_white";
export type ScanSource = "flatbed" | "adf";

export interface ScanConfig {
  deviceId: string;
  resolution: number;
  colorMode: ColorMode;
  duplex: boolean;
  source: ScanSource;
  paperSize: string;
}

const DPI_OPTIONS = [100, 150, 200, 300, 400, 600];

const COLOR_MODES: { value: ColorMode; label: string }[] = [
  { value: "color", label: "Color" },
  { value: "grayscale", label: "Grayscale" },
  { value: "black_white", label: "B&W" },
];

const PAPER_SIZES = [
  { value: "a4", label: "A4" },
  { value: "letter", label: "Letter" },
  { value: "legal", label: "Legal" },
  { value: "a3", label: "A3" },
];

interface ScannerConfigProps {
  scanners: Scanner[];
  selectedScannerId: string;
  onConfigChange: (config: ScanConfig) => void;
  onScan: () => void;
  isScanning: boolean;
  onRefreshScanners: () => void;
  isRefreshing: boolean;
}

export default function ScannerConfig({
  scanners,
  selectedScannerId,
  onConfigChange,
  onScan,
  isScanning,
  onRefreshScanners,
  isRefreshing,
}: ScannerConfigProps) {
  const [config, setConfig] = useState<ScanConfig>({
    deviceId: "",
    resolution: 300,
    colorMode: "color",
    duplex: false,
    source: "flatbed",
    paperSize: "a4",
  });

  useEffect(() => {
    if (selectedScannerId) {
      setConfig((prev) => ({ ...prev, deviceId: selectedScannerId }));
    }
  }, [selectedScannerId]);

  const updateConfig = useCallback(
    (partial: Partial<ScanConfig>) => {
      const next = { ...config, ...partial };
      setConfig(next);
      onConfigChange(next);
    },
    [config, onConfigChange]
  );

  const selectedScanner = selectedScannerId
    ? scanners.find((s) => s.id === selectedScannerId)
    : null;

  const canScan = !!selectedScannerId && !isScanning;

  return (
    <Card className="h-full">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center justify-between text-lg">
          <span>Scanner Configuration</span>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={onRefreshScanners}
            disabled={isRefreshing}
          >
            <RefreshCw
              className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`}
            />
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="scanner">Scanner</Label>
          <Select
            value={selectedScannerId}
            onValueChange={(v) => updateConfig({ deviceId: v })}
          >
            <SelectTrigger id="scanner">
              <SelectValue placeholder="Select scanner..." />
            </SelectTrigger>
            <SelectContent>
              {scanners.length === 0 && (
                <div className="px-2 py-4 text-center text-sm text-muted-foreground">
                  No scanners detected
                </div>
              )}
              {scanners.map((scanner) => (
                <SelectItem key={scanner.id} value={scanner.id}>
                  <div className="flex items-center gap-2">
                    <span>{scanner.name || scanner.device_id}</span>
                    <Badge
                      variant={scanner.is_available ? "success" : "secondary"}
                      className="ml-auto text-[10px] px-1.5 py-0"
                    >
                      {scanner.is_available ? "Online" : "Offline"}
                    </Badge>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedScanner && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{selectedScanner.vendor || "Unknown vendor"}</span>
              <span>·</span>
              <Badge
                variant={selectedScanner.is_available ? "success" : "destructive"}
                className="text-[10px] px-1.5 py-0"
              >
                {selectedScanner.is_available ? "Available" : "Unavailable"}
              </Badge>
            </div>
          )}
        </div>

        <Separator />

        <div className="space-y-2">
          <Label htmlFor="dpi">Resolution (DPI)</Label>
          <Select
            value={String(config.resolution)}
            onValueChange={(v) => updateConfig({ resolution: Number(v) })}
          >
            <SelectTrigger id="dpi">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DPI_OPTIONS.map((dpi) => (
                <SelectItem key={dpi} value={String(dpi)}>
                  {dpi} DPI
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Color Mode</Label>
          <div className="flex gap-2">
            {COLOR_MODES.map((mode) => (
              <Button
                key={mode.value}
                type="button"
                variant={
                  config.colorMode === mode.value ? "default" : "outline"
                }
                size="sm"
                className="flex-1"
                onClick={() => updateConfig({ colorMode: mode.value })}
              >
                {mode.label}
              </Button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex items-center gap-2">
            <Checkbox
              id="duplex"
              checked={config.duplex}
              onCheckedChange={(v) => updateConfig({ duplex: !!v })}
            />
            <Label htmlFor="duplex" className="cursor-pointer">
              Duplex
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="adf"
              checked={config.source === "adf"}
              onCheckedChange={(v) =>
                updateConfig({ source: v ? "adf" : "flatbed" })
              }
            />
            <Label htmlFor="adf" className="cursor-pointer">
              ADF Mode
            </Label>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="paper-size">Paper Size</Label>
          <Select
            value={config.paperSize}
            onValueChange={(v) => updateConfig({ paperSize: v })}
          >
            <SelectTrigger id="paper-size">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAPER_SIZES.map((size) => (
                <SelectItem key={size.value} value={size.value}>
                  {size.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Separator />

        <Button
          className="w-full gap-2"
          size="lg"
          onClick={onScan}
          disabled={!canScan}
        >
          {isScanning ? (
            <>
              <RefreshCw className="h-4 w-4 animate-spin" />
              Scanning...
            </>
          ) : (
            <>
              <Scan className="h-4 w-4" />
              Start Scan
            </>
          )}
        </Button>

        {scanners.length > 0 && !selectedScannerId && (
          <p className="flex items-center gap-1 text-xs text-amber-500">
            <AlertCircle className="h-3 w-3" />
            Select a scanner to begin
          </p>
        )}
        {scanners.length === 0 && !isRefreshing && (
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <AlertCircle className="h-3 w-3" />
            No scanners found. Click refresh to detect.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
