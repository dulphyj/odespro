"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  CalendarDays,
  Users,
  FileText,
  Clock,
  Download,
  Loader2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { reports as reportsApi } from "@/lib/api";
import { toast } from "@/components/ui/toast";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

const COLORS = ["hsl(var(--primary))", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"];

const reportTypes = [
  {
    id: "daily",
    title: "Diario",
    description: "Resumen de actividades del día",
    icon: CalendarDays,
    color: "text-blue-500",
  },
  {
    id: "monthly",
    title: "Mensual",
    description: "Estadísticas del mes",
    icon: BarChart3,
    color: "text-emerald-500",
  },
  {
    id: "by-user",
    title: "Por Usuario",
    description: "Actividad por usuario",
    icon: Users,
    color: "text-purple-500",
  },
  {
    id: "ocr",
    title: "Estadísticas OCR",
    description: "Procesamiento de OCR",
    icon: FileText,
    color: "text-amber-500",
  },
  {
    id: "pending",
    title: "Pendientes",
    description: "Documentos sin procesar",
    icon: Clock,
    color: "text-red-500",
  },
];

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ReportsPage() {
  const [activeReport, setActiveReport] = useState<string>("daily");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [month, setMonth] = useState(String(new Date().getMonth() + 1).padStart(2, "0"));
  const [year, setYear] = useState(String(new Date().getFullYear()));

  const { data: dailyData, isLoading: dailyLoading } = useQuery({
    queryKey: ["report-daily", date],
    queryFn: () => reportsApi.getDailyReport(date),
    select: (res) => res.data,
    enabled: activeReport === "daily",
  });

  const { data: monthlyData, isLoading: monthlyLoading } = useQuery({
    queryKey: ["report-monthly", year, month],
    queryFn: () => reportsApi.getMonthlyReport(Number(year), Number(month)),
    select: (res) => res.data,
    enabled: activeReport === "monthly",
  });

  const { data: ocrStats, isLoading: ocrLoading } = useQuery({
    queryKey: ["report-ocr-stats"],
    queryFn: () => reportsApi.getOcrStats(),
    select: (res) => res.data,
    enabled: activeReport === "ocr",
  });

  const { data: pendingDocs, isLoading: pendingLoading } = useQuery({
    queryKey: ["report-pending"],
    queryFn: () => reportsApi.getPendingDocuments(),
    select: (res) => res.data,
    enabled: activeReport === "pending",
  });

  const currentData = activeReport === "daily" ? dailyData : monthlyData;
  const currentLoading = activeReport === "daily" ? dailyLoading : monthlyLoading;

  const handleExport = async (format: "pdf" | "csv" | "xlsx") => {
    try {
      const res = await reportsApi.exportReport(activeReport, format);
      const blob = res.data as Blob;
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `report-${activeReport}-${date}.${format}`;
      a.click();
      window.URL.revokeObjectURL(url);
      toast({ title: `Reporte exportado como ${format.toUpperCase()}`, variant: "success" });
    } catch {
      toast({ title: "Error al exportar reporte", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Reportes</h1>
          <p className="text-sm text-muted-foreground">
            Estadísticas y reportes del sistema
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => handleExport("csv")}>
            <Download className="mr-1 h-3 w-3" /> CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleExport("xlsx")}>
            <Download className="mr-1 h-3 w-3" /> Excel
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleExport("pdf")}>
            <Download className="mr-1 h-3 w-3" /> PDF
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {reportTypes.map((type) => {
          const Icon = type.icon;
          return (
            <Card
              key={type.id}
              className={`cursor-pointer transition-all hover:shadow-md ${
                activeReport === type.id ? "ring-2 ring-primary" : ""
              }`}
              onClick={() => setActiveReport(type.id)}
            >
              <CardContent className="flex flex-col items-center p-4 text-center">
                <Icon className={`mb-2 h-8 w-8 ${type.color}`} />
                <p className="text-sm font-medium">{type.title}</p>
                <p className="text-xs text-muted-foreground">
                  {type.description}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {activeReport === "daily" && (
          <div className="flex items-center gap-2">
            <label className="text-sm text-muted-foreground">Fecha:</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
            />
          </div>
        )}
        {activeReport === "monthly" && (
          <>
            <div className="flex items-center gap-2">
              <label className="text-sm text-muted-foreground">Mes:</label>
              <select
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
              >
                {Array.from({ length: 12 }, (_, i) => (
                  <option key={i + 1} value={String(i + 1).padStart(2, "0")}>
                    {new Date(0, i).toLocaleString("es", { month: "long" })}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm text-muted-foreground">Año:</label>
              <select
                value={year}
                onChange={(e) => setYear(e.target.value)}
                className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
              >
                {Array.from({ length: 5 }, (_, i) => (
                  <option key={i} value={String(new Date().getFullYear() - i)}>
                    {new Date().getFullYear() - i}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}
      </div>

      {activeReport === "daily" || activeReport === "monthly" ? (
        currentLoading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-28" />
            ))}
          </div>
        ) : currentData ? (
          <>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">
                    Total documentos
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">
                    {currentData.total_documents}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">
                    OCR procesados
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">
                    {currentData.ocr_processed}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">
                    OCR pendientes
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">
                    {currentData.ocr_pending}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">
                    Almacenamiento
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">
                    {currentData.storage_formatted}
                  </p>
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    Documentos por tipo
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={Object.entries(currentData.documents_by_type).map(
                            ([name, value]) => ({
                              name,
                              value,
                            })
                          )}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={100}
                          paddingAngle={2}
                          dataKey="value"
                          label={({ name, percent }) =>
                            `${name} ${(percent * 100).toFixed(0)}%`
                          }
                        >
                          {Object.keys(currentData.documents_by_type).map(
                            (_, index) => (
                              <Cell
                                key={index}
                                fill={COLORS[index % COLORS.length]}
                              />
                            )
                          )}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    Documentos por fecha
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={Object.entries(currentData.documents_by_date).map(
                          ([name, value]) => ({ name, value })
                        )}
                      >
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis dataKey="name" className="text-xs text-muted-foreground" />
                        <YAxis className="text-xs text-muted-foreground" />
                        <Tooltip
                          contentStyle={{
                            background: "hsl(var(--card))",
                            border: "1px solid hsl(var(--border))",
                            borderRadius: "0.5rem",
                          }}
                        />
                        <Bar
                          dataKey="value"
                          fill="hsl(var(--primary))"
                          radius={[4, 4, 0, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </div>

            {currentData.top_users.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    Top usuarios
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={currentData.top_users.map((u) => ({
                          name: u.user.full_name,
                          value: u.count,
                        }))}
                        layout="vertical"
                      >
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis type="number" className="text-xs text-muted-foreground" />
                        <YAxis
                          type="category"
                          dataKey="name"
                          className="text-xs text-muted-foreground"
                          width={120}
                        />
                        <Tooltip
                          contentStyle={{
                            background: "hsl(var(--card))",
                            border: "1px solid hsl(var(--border))",
                            borderRadius: "0.5rem",
                          }}
                        />
                        <Bar
                          dataKey="value"
                          fill="hsl(var(--primary))"
                          radius={[0, 4, 4, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center py-20 text-muted-foreground">
            <BarChart3 className="mb-4 h-16 w-16" />
            <p className="text-lg">No hay datos disponibles</p>
          </div>
        )
      ) : activeReport === "ocr" ? (
        ocrLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : ocrStats ? (
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">
                  Total procesados
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{ocrStats.total}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-emerald-600">
                  Completados
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-emerald-600">
                  {ocrStats.processed}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-amber-600">
                  Pendientes
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-amber-600">
                  {ocrStats.pending}
                </p>
              </CardContent>
            </Card>
          </div>
        ) : (
          <div className="flex flex-col items-center py-20 text-muted-foreground">
            <FileText className="mb-4 h-16 w-16" />
            <p className="text-lg">No hay estadísticas OCR</p>
          </div>
        )
      ) : activeReport === "pending" ? (
        pendingLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : pendingDocs && pendingDocs.length > 0 ? (
          <div className="space-y-2">
            {pendingDocs.map((doc) => (
              <div
                key={doc.id}
                className="flex items-center justify-between rounded-lg border p-3"
              >
                <div>
                  <p className="text-sm font-medium">{doc.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(doc.created_at).toLocaleDateString("es")}
                  </p>
                </div>
                <Badge variant="warning">Pendiente OCR</Badge>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center py-20 text-muted-foreground">
            <Clock className="mb-4 h-16 w-16" />
            <p className="text-lg">No hay documentos pendientes</p>
          </div>
        )
      ) : (
        <div className="flex flex-col items-center py-20 text-muted-foreground">
          <BarChart3 className="mb-4 h-16 w-16" />
          <p className="text-lg">Seleccione un tipo de reporte</p>
        </div>
      )}
    </div>
  );
}
