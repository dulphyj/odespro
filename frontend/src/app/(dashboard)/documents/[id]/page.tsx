"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  FileText,
  Download,
  Trash2,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  RotateCw,
  RotateCcw,
  Loader2,
  ArrowLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import { documents as documentsApi, ocr } from "@/lib/api";
import type { DocumentType } from "@/types";

export default function DocumentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const id = Number(params.id);

  const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";
  const apiOrigin = apiBase.replace(/\/api\/v1.*$/, "");

  const [currentPage, setCurrentPage] = useState(1);
  const [zoom, setZoom] = useState(100);
  const [rotation, setRotation] = useState(0);

  const { data: docData, isLoading } = useQuery({
    queryKey: ["document", id],
    queryFn: () => documentsApi.getDocument(id),
    select: (res) => res.data,
    enabled: !!id,
  });

  const { data: pagesData } = useQuery({
    queryKey: ["document-pages", id],
    queryFn: () => documentsApi.getDocumentPages(id),
    select: (res) => res.data,
    enabled: !!id,
  });

  const { data: pdfData } = useQuery({
    queryKey: ["document-pdf", id],
    queryFn: () => documentsApi.downloadDocument(id),
    select: (res) => URL.createObjectURL(res.data as Blob),
    enabled: !!id && docData?.file_type === "pdf",
  });

  const { data: versionsData } = useQuery({
    queryKey: ["document-versions", id],
    queryFn: () => documentsApi.getDocumentVersions(id),
    select: (res) => res.data,
    enabled: !!id,
  });

  const { data: ocrData } = useQuery({
    queryKey: ["ocr-results", id],
    queryFn: () => ocr.getOcrResults(id),
    select: (res) => res.data,
    enabled: !!id,
  });

  const deleteMutation = useMutation({
    mutationFn: () => documentsApi.deleteDocument(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      toast({ title: "Documento eliminado", variant: "success" });
      router.push("/documents");
    },
    onError: () => {
      toast({
        title: "Error al eliminar",
        description: "No se pudo eliminar el documento",
        variant: "destructive",
      });
    },
  });

  const ocrMutation = useMutation({
    mutationFn: () => ocr.processOcr(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ocr-results", id] });
      queryClient.invalidateQueries({ queryKey: ["document", id] });
      toast({ title: "OCR procesado exitosamente", variant: "success" });
    },
    onError: () => {
      toast({
        title: "Error al procesar OCR",
        description: "No se pudo procesar el OCR del documento",
        variant: "destructive",
      });
    },
  });

  const downloadMutation = useMutation({
    mutationFn: () => documentsApi.downloadDocument(id),
    onSuccess: (res) => {
      const blob = res.data as Blob;
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = docData?.file_name ?? "document";
      a.click();
      window.URL.revokeObjectURL(url);
      toast({ title: "Descarga iniciada", variant: "success" });
    },
    onError: () => {
      toast({
        title: "Error al descargar",
        variant: "destructive",
      });
    },
  });

  const rotateMutation = useMutation({
    mutationFn: (degrees: number) =>
      documentsApi.rotatePage(id, currentPageData!.id, degrees),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["document-pages", id] });
      queryClient.invalidateQueries({ queryKey: ["document", id] });
      toast({ title: "Página rotada", variant: "success" });
    },
    onError: () => {
      toast({ title: "Error al rotar página", variant: "destructive" });
    },
  });

  const deletePageMutation = useMutation({
    mutationFn: () => documentsApi.deletePage(id, currentPageData!.id),
    onSuccess: () => {
      const newTotal = totalPages - 1;
      if (currentPage > newTotal) setCurrentPage(Math.max(1, newTotal));
      queryClient.invalidateQueries({ queryKey: ["document-pages", id] });
      queryClient.invalidateQueries({ queryKey: ["document", id] });
      toast({ title: "Página eliminada", variant: "success" });
    },
    onError: () => {
      toast({ title: "Error al eliminar página", variant: "destructive" });
    },
  });

  const reorderMutation = useMutation({
    mutationFn: (pageIds: number[]) =>
      documentsApi.reorderPages(id, pageIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["document-pages", id] });
      queryClient.invalidateQueries({ queryKey: ["document", id] });
      toast({ title: "Páginas reordenadas", variant: "success" });
    },
    onError: () => {
      toast({ title: "Error al reordenar", variant: "destructive" });
    },
  });

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getTypeBadge = (type: DocumentType) => {
    const variants: Record<string, "default" | "secondary" | "outline" | "success" | "warning"> = {
      pdf: "default",
      image: "secondary",
      word: "warning",
      excel: "success",
      text: "outline",
    };
    return variants[type] || "outline";
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!docData) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <FileText className="mb-4 h-16 w-16 text-muted-foreground" />
        <p className="text-lg font-medium">Documento no encontrado</p>
        <Button
          variant="link"
          onClick={() => router.push("/documents")}
        >
          Volver a documentos
        </Button>
      </div>
    );
  }

  const pages = pagesData ?? [];
  const currentPageData = pages[currentPage - 1];
  const totalPages = pages.length || 1;
  const currentOcrText = ocrData?.find((r) => r.page_number === currentPage)?.text ?? null;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push("/documents")}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="truncate text-xl font-bold">{docData.title}</h1>
          <p className="text-sm text-muted-foreground">
            {formatFileSize(docData.file_size)} ·{" "}
            {docData.file_name}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => downloadMutation.mutate()}
            disabled={downloadMutation.isPending}
          >
            <Download className="mr-2 h-4 w-4" />
            Descargar
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              if (confirm("¿Eliminar este documento?")) {
                deleteMutation.mutate();
              }
            }}
            disabled={deleteMutation.isPending}
          >
            {deleteMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="mr-2 h-4 w-4" />
            )}
            Eliminar
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-4">
        <div className="lg:col-span-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm">
                  Página {currentPage} de {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage((p) => p + 1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setZoom((z) => Math.max(25, z - 10))}
                >
                  <ZoomOut className="h-4 w-4" />
                </Button>
                <span className="w-12 text-center text-sm">{zoom}%</span>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setZoom((z) => Math.min(200, z + 10))}
                >
                  <ZoomIn className="h-4 w-4" />
                </Button>
                <Separator orientation="vertical" className="mx-1 h-6" />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setRotation((r) => (r + 90) % 360)}
                >
                  <RotateCw className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setRotation((r) => (r - 90 + 360) % 360)}
                >
                  <RotateCcw className="h-4 w-4" />
                </Button>
                <Separator orientation="vertical" className="mx-1 h-6" />
                {docData.file_type !== "pdf" && currentPageData && (
                  <>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => rotateMutation.mutate(90)}
                      disabled={rotateMutation.isPending}
                      title="Rotar página permanentemente"
                    >
                      <RotateCw className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deletePageMutation.mutate()}
                      disabled={deletePageMutation.isPending}
                      title="Eliminar página"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={currentPage <= 1 || reorderMutation.isPending}
                      onClick={() => {
                        const ids = pages.map((p) => p.id);
                        const idx = ids.indexOf(currentPageData.id);
                        if (idx > 0) {
                          [ids[idx - 1], ids[idx]] = [ids[idx], ids[idx - 1]];
                          reorderMutation.mutate(ids);
                        }
                      }}
                      title="Mover página arriba"
                    >
                      <ChevronLeft className="h-4 w-4 rotate-90" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={currentPage >= totalPages || reorderMutation.isPending}
                      onClick={() => {
                        const ids = pages.map((p) => p.id);
                        const idx = ids.indexOf(currentPageData.id);
                        if (idx < ids.length - 1) {
                          [ids[idx], ids[idx + 1]] = [ids[idx + 1], ids[idx]];
                          reorderMutation.mutate(ids);
                        }
                      }}
                      title="Mover página abajo"
                    >
                      <ChevronRight className="h-4 w-4 rotate-90" />
                    </Button>
                  </>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex gap-4">
                <div
                  className="flex flex-1 items-center justify-center overflow-auto rounded-lg bg-muted/50"
                  style={{ minHeight: "400px" }}
                >
                  {docData.file_type === "pdf" ? (
                    pdfData ? (
                      <iframe
                        src={pdfData}
                        className="h-[600px] w-full"
                        title={docData.title}
                      />
                    ) : (
                      <div className="flex flex-col items-center py-20 text-muted-foreground">
                        <Loader2 className="mb-2 h-8 w-8 animate-spin" />
                        <p>Cargando PDF...</p>
                      </div>
                    )
                  ) : currentPageData ? (
                    <div
                      style={{
                        transform: `scale(${zoom / 100}) rotate(${rotation}deg)`,
                        transition: "transform 0.2s ease",
                      }}
                    >
                      <img
                        src={`${apiOrigin}${currentPageData.image_url}`}
                        alt={`Página ${currentPage}`}
                        className="max-h-[600px] rounded-lg object-contain"
                      />
                    </div>
                  ) : (
                    <div className="flex flex-col items-center py-20 text-muted-foreground">
                      <FileText className="mb-2 h-12 w-12" />
                      <p>Vista previa no disponible</p>
                    </div>
                  )}
                </div>
                {currentOcrText && (
                  <div className="w-80 shrink-0 overflow-auto rounded-lg border bg-card p-4">
                    <h4 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
                      Texto OCR - Página {currentPage}
                    </h4>
                    <p className="whitespace-pre-wrap text-xs leading-relaxed">
                      {currentOcrText}
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {pages.length > 0 && (
            <div className="mt-4 flex gap-2 overflow-x-auto pb-2">
              {pages.map((page) => (
                <button
                  key={page.id}
                  onClick={() => setCurrentPage(page.page_number)}
                  className={`shrink-0 overflow-hidden rounded-md border-2 transition-colors ${
                    currentPage === page.page_number
                      ? "border-primary"
                      : "border-transparent hover:border-muted-foreground/50"
                  }`}
                >
                  <img
                    src={`${apiOrigin}${page.thumbnail_url}`}
                    alt={`Miniatura ${page.page_number}`}
                    className="h-20 w-14 object-cover"
                  />
                </button>
              ))}
            </div>
          )}

          <Card className="mt-4">
            <Tabs defaultValue="ocr">
              <TabsList className="mx-4 mt-4">
                <TabsTrigger value="ocr">Resultados OCR</TabsTrigger>
                <TabsTrigger value="metadata">Índices / Metadatos</TabsTrigger>
                <TabsTrigger value="versions">Historial de versiones</TabsTrigger>
              </TabsList>
              <CardContent className="pt-4">
                <TabsContent value="ocr" className="mt-0">
                  {ocrData && ocrData.length > 0 ? (
                    <div className="space-y-4">
                      {ocrData.map((result) => (
                        <div key={result.id} className="rounded-lg border p-3">
                          <div className="mb-2 flex items-center justify-between">
                            <span className="text-xs font-medium text-muted-foreground">
                              Página {result.page_number}
                            </span>
                            <Badge variant="outline">
                              {Math.round(result.confidence * 100)}% confianza
                            </Badge>
                          </div>
                          <p className="whitespace-pre-wrap text-sm">
                            {result.text}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-4 py-10 text-muted-foreground">
                      <FileText className="h-8 w-8" />
                      <p className="text-sm">
                        {docData.ocr_processed
                          ? "No hay resultados OCR disponibles"
                          : "OCR pendiente de procesar"}
                      </p>
                      {!docData.ocr_processed && (
                        <Button
                          onClick={() => ocrMutation.mutate()}
                          disabled={ocrMutation.isPending}
                        >
                          {ocrMutation.isPending ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Procesando...
                            </>
                          ) : (
                            "Procesar OCR ahora"
                          )}
                        </Button>
                      )}
                    </div>
                  )}
                </TabsContent>
                <TabsContent value="metadata" className="mt-0">
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-xs text-muted-foreground">Título</p>
                        <p className="text-sm font-medium">{docData.title}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Tipo</p>
                        <Badge variant={getTypeBadge(docData.file_type)}>
                          {docData.file_type.toUpperCase()}
                        </Badge>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Archivo</p>
                        <p className="text-sm">{docData.file_name}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Tamaño</p>
                        <p className="text-sm">{formatFileSize(docData.file_size)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Creado por</p>
                        <p className="text-sm">
                          {docData.created_by_user?.full_name ?? "—"}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Fecha creación</p>
                        <p className="text-sm">
                          {new Date(docData.created_at).toLocaleDateString("es")}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Última modificación</p>
                        <p className="text-sm">
                          {new Date(docData.updated_at).toLocaleDateString("es")}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Páginas</p>
                        <p className="text-sm">{docData.page_count ?? "—"}</p>
                      </div>
                    </div>
                    {docData.tags.length > 0 && (
                      <div>
                        <p className="mb-1 text-xs text-muted-foreground">Tags</p>
                        <div className="flex flex-wrap gap-1">
                          {docData.tags.map((tag) => (
                            <Badge key={tag} variant="secondary">{tag}</Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    {docData.description && (
                      <div>
                        <p className="text-xs text-muted-foreground">Descripción</p>
                        <p className="text-sm">{docData.description}</p>
                      </div>
                    )}
                    {docData.metadata && Object.keys(docData.metadata).length > 0 && (
                      <div>
                        <p className="mb-1 text-xs text-muted-foreground">
                          Metadatos adicionales
                        </p>
                        {Object.entries(docData.metadata).map(([key, value]) => (
                          <div key={key} className="grid grid-cols-2 gap-1 border-b py-1 text-sm">
                            <span className="text-muted-foreground">{key}</span>
                            <span>{String(value)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </TabsContent>
                <TabsContent value="versions" className="mt-0">
                  {versionsData && versionsData.length > 0 ? (
                    <div className="space-y-2">
                      {versionsData.map((version) => (
                        <div
                          key={version.id}
                          className="flex items-center justify-between rounded-lg border p-3"
                        >
                          <div>
                            <p className="text-sm font-medium">
                              Versión {version.version_number}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {formatFileSize(version.file_size)} ·{" "}
                              {version.created_by_user?.full_name ?? "—"} ·{" "}
                              {new Date(version.created_at).toLocaleDateString("es")}
                            </p>
                          </div>
                          <Button variant="ghost" size="icon">
                            <Download className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center py-10 text-muted-foreground">
                      <FileText className="mb-2 h-8 w-8" />
                      <p className="text-sm">Sin historial de versiones</p>
                    </div>
                  )}
                </TabsContent>
              </CardContent>
            </Tabs>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Información</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Estado OCR</span>
                {docData.ocr_processed ? (
                  <Badge variant="success">Completado</Badge>
                ) : (
                  <Badge variant="warning">Pendiente</Badge>
                )}
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Checksum</span>
                <span className="font-mono text-xs">
                  {docData.checksum.slice(0, 12)}...
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Favorito</span>
                <span>{docData.is_favorite ? "Sí" : "No"}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
