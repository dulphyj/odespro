"use client";

import { useQuery } from "@tanstack/react-query";
import {
  FileText,
  Scan,
  Clock,
  Users,
  Upload,
  Search,
  ArrowRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { reports, documents } from "@/lib/api";
import { useRouter } from "next/navigation";
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
} from "recharts";

const chartData = [
  { name: "Lun", documentos: 12 },
  { name: "Mar", documentos: 19 },
  { name: "Mié", documentos: 15 },
  { name: "Jue", documentos: 22 },
  { name: "Vie", documentos: 28 },
  { name: "Sáb", documentos: 8 },
  { name: "Dom", documentos: 5 },
];

export default function DashboardPage() {
  const router = useRouter();

  const { data: reportData, isLoading: reportLoading } = useQuery({
    queryKey: ["report-daily"],
    queryFn: () => reports.getDailyReport(),
    select: (res) => res.data,
  });

  const { data: recentDocs, isLoading: docsLoading } = useQuery({
    queryKey: ["documents-recent"],
    queryFn: () =>
      documents.getDocuments({ page: 1, page_size: 5, sort_by: "created_at", sort_order: "desc" }),
    select: (res) => res.data.items,
  });

  const stats = [
    {
      title: "Documentos totales",
      value: reportData?.total_documents ?? 0,
      icon: FileText,
      description: "En toda la plataforma",
      trend: "+12%",
    },
    {
      title: "Escaneos hoy",
      value: reportData?.recent_uploads ?? 0,
      icon: Scan,
      description: "Digitalizaciones del día",
      trend: "+5%",
    },
    {
      title: "OCR pendientes",
      value: reportData?.ocr_pending ?? 0,
      icon: Clock,
      description: "Documentos por procesar",
      trend: "-3%",
    },
    {
      title: "Usuarios activos",
      value: reportData?.total_users ?? 0,
      icon: Users,
      description: "Cuentas registradas",
      trend: "+2%",
    },
  ];

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Resumen general del sistema de gestión documental
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.title}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">
                  {stat.title}
                </CardTitle>
                <Icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {reportLoading ? (
                  <Skeleton className="h-8 w-20" />
                ) : (
                  <>
                    <div className="text-2xl font-bold">{stat.value}</div>
                    <p className="text-xs text-muted-foreground">
                      {stat.description}{" "}
                      <span className="font-medium text-emerald-500">
                        {stat.trend}
                      </span>
                    </p>
                  </>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-7">
        <Card className="lg:col-span-4">
          <CardHeader>
            <CardTitle className="text-base">Producción de documentos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
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
                    dataKey="documentos"
                    fill="hsl(var(--primary))"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Documentos recientes</CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push("/documents")}
            >
              Ver todos <ArrowRight className="ml-1 h-3 w-3" />
            </Button>
          </CardHeader>
          <CardContent>
            {docsLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {recentDocs?.map((doc) => (
                  <div
                    key={doc.id}
                    className="flex cursor-pointer items-center gap-3 rounded-lg border p-2 transition-colors hover:bg-accent"
                    onClick={() => router.push(`/documents/${doc.id}`)}
                  >
                    <FileText className="h-8 w-8 shrink-0 text-muted-foreground" />
                    <div className="flex-1 overflow-hidden">
                      <p className="truncate text-sm font-medium">{doc.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatFileSize(doc.file_size)} ·{" "}
                        {new Date(doc.created_at).toLocaleDateString("es")}
                      </p>
                    </div>
                    <Badge
                      variant={
                        doc.ocr_processed ? "success" : "warning"
                      }
                      className="shrink-0"
                    >
                      {doc.ocr_processed ? "OCR OK" : "Pendiente"}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card
          className="cursor-pointer border-dashed transition-colors hover:bg-accent"
          onClick={() => router.push("/scan")}
        >
          <CardContent className="flex flex-col items-center justify-center py-8">
            <Scan className="mb-2 h-8 w-8 text-primary" />
            <p className="font-medium">Nuevo escaneo</p>
            <p className="text-xs text-muted-foreground">
              Digitalizar documentos
            </p>
          </CardContent>
        </Card>
        <Card
          className="cursor-pointer border-dashed transition-colors hover:bg-accent"
          onClick={() => router.push("/documents")}
        >
          <CardContent className="flex flex-col items-center justify-center py-8">
            <Upload className="mb-2 h-8 w-8 text-primary" />
            <p className="font-medium">Subir documento</p>
            <p className="text-xs text-muted-foreground">
              Cargar archivos al sistema
            </p>
          </CardContent>
        </Card>
        <Card
          className="cursor-pointer border-dashed transition-colors hover:bg-accent"
          onClick={() => router.push("/search")}
        >
          <CardContent className="flex flex-col items-center justify-center py-8">
            <Search className="mb-2 h-8 w-8 text-primary" />
            <p className="font-medium">Buscar</p>
            <p className="text-xs text-muted-foreground">
              Encontrar documentos
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
