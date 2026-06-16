"use client";

import { Settings, User, Shield, KeyRound } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuthStore } from "@/store/auth-store";
import { Badge } from "@/components/ui/badge";

export default function SettingsPage() {
  const user = useAuthStore((s) => s.user);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Configuración</h1>
        <p className="text-sm text-muted-foreground">Administración del sistema</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Perfil de usuario
          </CardTitle>
          <CardDescription>Información de la cuenta actual</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex justify-between"><span className="text-muted-foreground">Usuario</span><span className="font-medium">{user?.username}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Nombre</span><span>{user?.full_name}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Email</span><span>{user?.email}</span></div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Estado</span>
            <Badge variant={user?.is_active ? "success" : "destructive"}>{user?.is_active ? "Activo" : "Inactivo"}</Badge>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Información del sistema
          </CardTitle>
          <CardDescription>Versión y estado del sistema</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex justify-between"><span className="text-muted-foreground">Versión</span><span>1.0.0</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Superusuario</span><Badge variant={user?.is_superuser ? "default" : "secondary"}>{user?.is_superuser ? "Sí" : "No"}</Badge></div>
        </CardContent>
      </Card>
    </div>
  );
}
