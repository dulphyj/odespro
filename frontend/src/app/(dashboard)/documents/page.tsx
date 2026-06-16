"use client";

import { useState, useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useDropzone } from "react-dropzone";
import {
  FileText,
  Upload,
  Search,
  Grid3X3,
  List,
  Download,
  Trash2,
  Move,
  MoreHorizontal,
  Loader2,
  ChevronLeft,
  ChevronRight,
  FileUp,
  Filter,
  X,
  Eye,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import { documents as documentsApi, uploadDocument } from "@/lib/api";
import { useAppStore } from "@/store/app-store";
import type { Document, DocumentType } from "@/types";

export default function DocumentsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { selectedDocuments, toggleDocument, clearSelection, selectAll } =
    useAppStore();

  const [search, setSearch] = useState("");
  const [folderId, setFolderId] = useState<string>("all");
  const [fileType, setFileType] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [pageSize] = useState(12);
  const [viewMode, setViewMode] = useState<"grid" | "list">("list");
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["documents", page, pageSize, search, folderId, fileType],
    queryFn: () =>
      documentsApi.getDocuments({
        page,
        page_size: pageSize,
        search: search || undefined,
        folder_id: folderId !== "all" ? Number(folderId) : undefined,
        file_type: fileType !== "all" ? fileType : undefined,
      }),
    select: (res) => res.data,
  });

  const deleteMutation = useMutation({
    mutationFn: (ids: number[]) =>
      Promise.all(ids.map((id) => documentsApi.deleteDocument(id))),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      clearSelection();
      toast({ title: "Documentos eliminados", variant: "success" });
    },
    onError: () => {
      toast({
        title: "Error al eliminar",
        description: "No se pudieron eliminar los documentos",
        variant: "destructive",
      });
    },
  });

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      setIsUploading(true);
      setUploadProgress(0);
      try {
        for (const file of acceptedFiles) {
          const title = file.name.replace(/\.[^/.]+$/, "");
          await uploadDocument(file, title, (progress) =>
            setUploadProgress(progress)
          );
        }
        queryClient.invalidateQueries({ queryKey: ["documents"] });
        toast({
          title: "Archivos subidos",
          description: `${acceptedFiles.length} archivos subidos correctamente`,
          variant: "success",
        });
        setShowUploadDialog(false);
      } catch {
        toast({
          title: "Error al subir",
          description: "No se pudieron subir los archivos",
          variant: "destructive",
        });
      } finally {
        setIsUploading(false);
        setUploadProgress(0);
      }
    },
    [queryClient]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/pdf": [".pdf"],
      "image/*": [".png", ".jpg", ".jpeg", ".tiff", ".tif"],
      "application/msword": [".doc", ".docx"],
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [
        ".xlsx",
      ],
    },
    multiple: true,
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

  const allSelected =
    (data?.items?.length ?? 0) > 0 && selectedDocuments.length === (data?.items?.length ?? 0);

  const handleSelectAll = () => {
    if (allSelected) {
      clearSelection();
    } else if (data?.items) {
      selectAll(data.items.map((d) => d.id));
    }
  };

  const handleDeleteSelected = () => {
    if (selectedDocuments.length > 0) {
      deleteMutation.mutate(selectedDocuments);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Documentos</h1>
          <p className="text-sm text-muted-foreground">
            Gestión de documentos digitales
          </p>
        </div>
        <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
          <DialogTrigger asChild>
            <Button>
              <Upload className="mr-2 h-4 w-4" />
              Subir documento
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Subir documento</DialogTitle>
              <DialogDescription>
                Arrastre archivos o haga clic para seleccionar
              </DialogDescription>
            </DialogHeader>
            <div
              {...getRootProps()}
              className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-12 transition-colors ${
                isDragActive
                  ? "border-primary bg-primary/5"
                  : "border-muted-foreground/25 hover:border-primary/50"
              }`}
            >
              <input {...getInputProps()} />
              <FileUp className="mb-4 h-10 w-10 text-muted-foreground" />
              {isDragActive ? (
                <p className="text-sm font-medium text-primary">
                  Suelte los archivos aquí...
                </p>
              ) : (
                <>
                  <p className="text-sm font-medium">
                    Arrastre archivos o haga clic
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    PDF, imágenes, Word, Excel
                  </p>
                </>
              )}
            </div>
            {isUploading && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span>Subiendo...</span>
                  <span>{uploadProgress}%</span>
                </div>
                <Progress value={uploadProgress} />
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar documentos..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="pl-8"
          />
        </div>
        <Select value={fileType} onValueChange={(v) => { setFileType(v); setPage(1); }}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="pdf">PDF</SelectItem>
            <SelectItem value="image">Imagen</SelectItem>
            <SelectItem value="word">Word</SelectItem>
            <SelectItem value="excel">Excel</SelectItem>
            <SelectItem value="text">Texto</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex items-center rounded-md border">
          <Button
            variant={viewMode === "grid" ? "secondary" : "ghost"}
            size="icon"
            className="h-9 w-9 rounded-none rounded-l-md"
            onClick={() => setViewMode("grid")}
          >
            <Grid3X3 className="h-4 w-4" />
          </Button>
          <Button
            variant={viewMode === "list" ? "secondary" : "ghost"}
            size="icon"
            className="h-9 w-9 rounded-none rounded-r-md"
            onClick={() => setViewMode("list")}
          >
            <List className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {selectedDocuments.length > 0 && (
        <div className="flex items-center gap-2 rounded-lg border bg-muted/50 p-2">
          <span className="text-sm text-muted-foreground">
            {selectedDocuments.length} seleccionados
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={handleDeleteSelected}
            disabled={deleteMutation.isPending}
          >
            <Trash2 className="mr-1 h-3 w-3" />
            Eliminar
          </Button>
          <Button variant="outline" size="sm">
            <Move className="mr-1 h-3 w-3" />
            Mover
          </Button>
          <Button variant="outline" size="sm">
            <Download className="mr-1 h-3 w-3" />
            Exportar
          </Button>
          <Button variant="ghost" size="sm" onClick={clearSelection}>
            <X className="mr-1 h-3 w-3" />
            Limpiar
          </Button>
        </div>
      )}

      {isLoading ? (
        viewMode === "grid" ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Card key={i}>
                <CardContent className="p-4">
                  <Skeleton className="mb-2 h-32 w-full" />
                  <Skeleton className="mb-1 h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        )
      ) : (
        <>
          {viewMode === "grid" ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {data?.items.map((doc) => (
                <Card
                  key={doc.id}
                  className="cursor-pointer transition-colors hover:bg-accent"
                  onClick={() => router.push(`/documents/${doc.id}`)}
                >
                  <CardContent className="p-4">
                    <div className="mb-2 flex aspect-[3/4] items-center justify-center rounded-md bg-muted">
                      <FileText className="h-12 w-12 text-muted-foreground" />
                    </div>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {doc.title}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatFileSize(doc.file_size)} ·{" "}
                          {new Date(doc.created_at).toLocaleDateString("es")}
                        </p>
                      </div>
                      <Checkbox
                        checked={selectedDocuments.includes(doc.id)}
                        onCheckedChange={() => toggleDocument(doc.id)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <Badge variant={getTypeBadge(doc.file_type)}>
                        {doc.file_type.toUpperCase()}
                      </Badge>
                      {doc.ocr_processed && (
                        <Badge variant="success">OCR</Badge>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={allSelected || selectedDocuments.length === (data?.items?.length ?? 0)}
                        onCheckedChange={handleSelectAll}
                      />
                    </TableHead>
                    <TableHead>Título</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Tamaño</TableHead>
                    <TableHead>Propietario</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Fecha</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
              {data?.items.map((doc) => (
                    <TableRow
                      key={doc.id}
                      className="cursor-pointer"
                      onClick={() => router.push(`/documents/${doc.id}`)}
                    >
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedDocuments.includes(doc.id)}
                          onCheckedChange={() => toggleDocument(doc.id)}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                          <span className="truncate font-medium">
                            {doc.title}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={getTypeBadge(doc.file_type)}>
                          {doc.file_type.toUpperCase()}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatFileSize(doc.file_size)}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {doc.created_by_user?.full_name ?? "—"}
                      </TableCell>
                      <TableCell>
                        {doc.ocr_processed ? (
                          <Badge variant="success">Completado</Badge>
                        ) : (
                          <Badge variant="warning">Pendiente</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(doc.created_at).toLocaleDateString("es")}
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Acciones</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => router.push(`/documents/${doc.id}`)}
                            >
                              <Eye className="mr-2 h-4 w-4" />
                              Ver detalle
                            </DropdownMenuItem>
                            <DropdownMenuItem>
                              <Download className="mr-2 h-4 w-4" />
                              Descargar
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => deleteMutation.mutate([doc.id])}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Eliminar
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Mostrando {data?.items?.length ?? 0} de {data?.total ?? 0} documentos
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="h-4 w-4" />
                Anterior
              </Button>
              <span className="text-sm text-muted-foreground">
                Página {page} de {data ? Math.ceil(data.total / pageSize) : 1}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= (data ? Math.ceil(data.total / pageSize) : 1)}
                onClick={() => setPage((p) => p + 1)}
              >
                Siguiente
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
