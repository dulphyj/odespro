"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import {
  Search,
  FileText,
  Filter,
  SlidersHorizontal,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { search as searchApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { DocumentType } from "@/types";

export default function SearchPage() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [fileType, setFileType] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState("created_at");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [activeTab, setActiveTab] = useState("texto");
  const [showFilters, setShowFilters] = useState(false);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: [
      "search",
      searchQuery,
      fileType,
      dateFrom,
      dateTo,
      page,
      sortBy,
      sortOrder,
    ],
    queryFn: () =>
      searchApi.search({
        query: searchQuery,
        file_type: fileType !== "all" ? (fileType as DocumentType) : undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        page,
        page_size: 20,
        sort_by: sortBy,
        sort_order: sortOrder,
      }),
    select: (res) => res.data,
    enabled: searchQuery.length > 0,
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearchQuery(query);
    setPage(1);
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

  const highlightText = (text: string, search: string) => {
    if (!search.trim()) return text;
    const regex = new RegExp(`(${search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
    const parts = text.split(regex);
    return parts.map((part, i) =>
      regex.test(part) ? (
        <mark key={i} className="bg-primary/20 rounded px-0.5">{part}</mark>
      ) : (
        part
      )
    );
  };

  const getExcerpt = (text: string | null, search: string, maxLen = 200) => {
    if (!text) return "";
    const lower = text.toLowerCase();
    const idx = lower.indexOf(search.toLowerCase());
    if (idx === -1) return text.slice(0, maxLen) + "...";
    const start = Math.max(0, idx - 60);
    const end = Math.min(text.length, idx + search.length + 100);
    const excerpt = text.slice(start, end);
    return (start > 0 ? "..." : "") + excerpt + (end < text.length ? "..." : "");
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Búsqueda</h1>
        <p className="text-sm text-muted-foreground">
          Busque documentos, texto OCR, índices y más
        </p>
      </div>

      <form onSubmit={handleSearch} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-5 w-5 text-muted-foreground" />
          <Input
            placeholder="Buscar en documentos, OCR, índices..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-10 py-6 text-lg"
          />
        </div>
        <Button type="submit" size="lg" disabled={isFetching}>
          {isFetching ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Search className="mr-2 h-4 w-4" />
          )}
          Buscar
        </Button>
        <Button
          type="button"
          variant="outline"
          size="lg"
          onClick={() => setShowFilters(!showFilters)}
        >
          <SlidersHorizontal className="h-4 w-4" />
        </Button>
      </form>

      {showFilters && (
        <Card>
          <CardContent className="flex flex-wrap items-end gap-3 p-4">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Tipo</label>
              <Select value={fileType} onValueChange={setFileType}>
                <SelectTrigger className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="pdf">PDF</SelectItem>
                  <SelectItem value="image">Imagen</SelectItem>
                  <SelectItem value="word">Word</SelectItem>
                  <SelectItem value="excel">Excel</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Desde</label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="h-10"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Hasta</label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="h-10"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Ordenar por</label>
              <Select
                value={sortBy}
                onValueChange={(v) => {
                  setSortBy(v);
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="created_at">Fecha</SelectItem>
                  <SelectItem value="title">Título</SelectItem>
                  <SelectItem value="file_size">Tamaño</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Orden</label>
              <Select
                value={sortOrder}
                onValueChange={(v) => {
                  setSortOrder(v as "asc" | "desc");
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="desc">Desc</SelectItem>
                  <SelectItem value="asc">Asc</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="texto">Texto</TabsTrigger>
          <TabsTrigger value="ocr">OCR</TabsTrigger>
          <TabsTrigger value="indices">Índices</TabsTrigger>
          <TabsTrigger value="similitud">Similitud</TabsTrigger>
        </TabsList>

        <TabsContent value="texto" className="mt-4">
          {!searchQuery ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <Search className="mb-4 h-16 w-16" />
              <p className="text-lg">Ingrese un término de búsqueda</p>
              <p className="text-sm">
                Busque en documentos, texto OCR e índices
              </p>
            </div>
          ) : isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-24 w-full" />
              ))}
            </div>
          ) : data && data.results.length > 0 ? (
            <>
              <div className="mb-4 flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  {data.total} resultados encontrados ({data.query_time_ms}ms)
                </p>
                <Select value={sortBy} onValueChange={setSortBy}>
                  <SelectTrigger className="w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="created_at">Más recientes</SelectItem>
                    <SelectItem value="title">Título</SelectItem>
                    <SelectItem value="file_size">Tamaño</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                {data.results.map((doc) => (
                  <div
                    key={doc.id}
                    className="cursor-pointer rounded-lg border p-4 transition-colors hover:bg-accent"
                    onClick={() => router.push(`/documents/${doc.id}`)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <FileText className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
                        <div>
                          <p className="font-medium">
                            {highlightText(doc.title, searchQuery)}
                          </p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {highlightText(getExcerpt(doc.ocr_text, searchQuery), searchQuery)}
                          </p>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <Badge variant={getTypeBadge(doc.file_type)}>
                          {doc.file_type.toUpperCase()}
                        </Badge>
                        {doc.ocr_processed && (
                          <Badge variant="success">OCR</Badge>
                        )}
                      </div>
                    </div>
                    <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {new Date(doc.created_at).toLocaleDateString("es")}
                      </span>
                      <span>{doc.created_by_user?.full_name ?? "—"}</span>
                    </div>
                  </div>
                ))}
              </div>

              {data.total_pages > 1 && (
                <div className="flex items-center justify-center gap-2 pt-4">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Anterior
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    Página {page} de {data.total_pages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= data.total_pages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Siguiente
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <FileText className="mb-4 h-16 w-16" />
              <p className="text-lg">Sin resultados</p>
              <p className="text-sm">
                No se encontraron documentos para &quot;{searchQuery}&quot;
              </p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="ocr" className="mt-4">
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <FileText className="mb-4 h-16 w-16" />
            <p className="text-lg">Búsqueda OCR</p>
            <p className="text-sm">
              Realice una búsqueda para ver resultados de texto OCR
            </p>
          </div>
        </TabsContent>

        <TabsContent value="indices" className="mt-4">
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <FileText className="mb-4 h-16 w-16" />
            <p className="text-lg">Búsqueda por índices</p>
            <p className="text-sm">
              Busque en los índices y metadatos de los documentos
            </p>
          </div>
        </TabsContent>

        <TabsContent value="similitud" className="mt-4">
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <FileText className="mb-4 h-16 w-16" />
            <p className="text-lg">Búsqueda por similitud</p>
            <p className="text-sm">
              Encuentre documentos similares por contenido
            </p>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
