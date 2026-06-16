"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ClipboardList,
  Search,
  ChevronLeft,
  ChevronRight,
  Filter,
  Eye,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { audit } from "@/lib/api";
import type { AuditLog } from "@/types";

const actionLabels: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" | "success" | "warning" }> = {
  create: { label: "Creación", variant: "success" },
  update: { label: "Actualización", variant: "warning" },
  delete: { label: "Eliminación", variant: "destructive" },
  login: { label: "Inicio sesión", variant: "default" },
  logout: { label: "Cierre sesión", variant: "outline" },
  download: { label: "Descarga", variant: "secondary" },
  view: { label: "Visualización", variant: "secondary" },
  upload: { label: "Carga", variant: "success" },
  ocr_process: { label: "Proceso OCR", variant: "default" },
};

function getActionInfo(action: string) {
  return actionLabels[action] || { label: action, variant: "outline" as const };
}

function formatDetails(details: Record<string, unknown>) {
  if (!details || Object.keys(details).length === 0) return "—";
  return Object.entries(details)
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n");
}

export default function AuditPage() {
  const [page, setPage] = useState(1);
  const [actionFilter, setActionFilter] = useState("all");
  const [entityFilter, setEntityFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: [
      "audit-logs",
      page,
      actionFilter,
      entityFilter,
      dateFrom,
      dateTo,
      userSearch,
    ],
    queryFn: () =>
      audit.getAuditLogs({
        page,
        page_size: 30,
        action: actionFilter !== "all" ? actionFilter : undefined,
        entity_type: entityFilter !== "all" ? entityFilter : undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        user_id: userSearch ? Number(userSearch) : undefined,
      }),
    select: (res) => res.data,
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Auditoría</h1>
          <p className="text-sm text-muted-foreground">
            Registro de actividades del sistema
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => setShowFilters(!showFilters)}
        >
          <Filter className="mr-2 h-4 w-4" />
          Filtros
        </Button>
      </div>

      {showFilters && (
        <Card>
          <CardContent className="flex flex-wrap items-end gap-3 p-4">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Acción</label>
              <Select value={actionFilter} onValueChange={(v) => { setActionFilter(v); setPage(1); }}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  <SelectItem value="create">Creación</SelectItem>
                  <SelectItem value="update">Actualización</SelectItem>
                  <SelectItem value="delete">Eliminación</SelectItem>
                  <SelectItem value="login">Inicio sesión</SelectItem>
                  <SelectItem value="logout">Cierre sesión</SelectItem>
                  <SelectItem value="download">Descarga</SelectItem>
                  <SelectItem value="upload">Carga</SelectItem>
                  <SelectItem value="view">Visualización</SelectItem>
                  <SelectItem value="ocr_process">Proceso OCR</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Entidad</label>
              <Select value={entityFilter} onValueChange={(v) => { setEntityFilter(v); setPage(1); }}>
                <SelectTrigger className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  <SelectItem value="document">Documento</SelectItem>
                  <SelectItem value="user">Usuario</SelectItem>
                  <SelectItem value="folder">Carpeta</SelectItem>
                  <SelectItem value="role">Rol</SelectItem>
                  <SelectItem value="auth">Autenticación</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Desde</label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
                className="h-10"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Hasta</label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
                className="h-10"
              />
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Usuario</TableHead>
                <TableHead>Acción</TableHead>
                <TableHead>Entidad</TableHead>
                <TableHead>ID Entidad</TableHead>
                <TableHead>IP</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.items.map((log) => {
                const actionInfo = getActionInfo(log.action);
                return (
                  <TableRow key={log.id}>
                    <TableCell className="text-muted-foreground">
                      {new Date(log.created_at).toLocaleString("es")}
                    </TableCell>
                    <TableCell>
                      {log.user?.full_name ?? log.user?.username ?? "Sistema"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={actionInfo.variant}>
                        {actionInfo.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground capitalize">
                      {log.entity_type}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {log.entity_id ?? "—"}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {log.ip_address}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setSelectedLog(log)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Mostrando {data?.items?.length ?? 0} de {data?.total ?? 0} registros
        </p>
        <div className="flex items-center gap-2">
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
            Página {page} de {Math.ceil((data?.total ?? 0) / 30)}
          </span>
          <Button
            variant="outline"
            size="sm"
              disabled={page >= Math.ceil((data?.total ?? 0) / 30)}
            onClick={() => setPage((p) => p + 1)}
          >
            Siguiente
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Dialog
        open={!!selectedLog}
        onOpenChange={(open) => {
          if (!open) setSelectedLog(null);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Detalle de auditoría</DialogTitle>
            <DialogDescription>
              Información completa del evento de auditoría
            </DialogDescription>
          </DialogHeader>
          {selectedLog && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground">Fecha</p>
                  <p className="text-sm">
                    {new Date(selectedLog.created_at).toLocaleString("es")}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Acción</p>
                  <Badge
                    variant={getActionInfo(selectedLog.action).variant}
                  >
                    {getActionInfo(selectedLog.action).label}
                  </Badge>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Usuario</p>
                  <p className="text-sm">
                    {selectedLog.user?.full_name ??
                      selectedLog.user?.username ??
                      "Sistema"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Email</p>
                  <p className="text-sm">
                    {selectedLog.user?.email ?? "—"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Entidad</p>
                  <p className="text-sm capitalize">
                    {selectedLog.entity_type}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">ID Entidad</p>
                  <p className="text-sm">
                    {selectedLog.entity_id ?? "—"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Dirección IP</p>
                  <p className="font-mono text-sm">
                    {selectedLog.ip_address}
                  </p>
                </div>
              </div>
              <div>
                <p className="mb-1 text-xs text-muted-foreground">
                  Detalles
                </p>
                <pre className="whitespace-pre-wrap rounded-lg bg-muted p-3 text-xs">
                  {formatDetails(selectedLog.details)}
                </pre>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
