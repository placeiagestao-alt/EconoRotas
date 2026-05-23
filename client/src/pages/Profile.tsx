import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

export default function Profile() {
  const { user, loading, logout } = useAuth();

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin" />
        </div>
      </DashboardLayout>
    );
  }

  if (!user) {
    return (
      <DashboardLayout>
        <Card>
          <CardContent className="pt-6">
            <p className="text-muted-foreground">Usuário não autenticado</p>
          </CardContent>
        </Card>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">Meu Perfil</h1>

        <Card>
          <CardHeader>
            <CardTitle>Informações da Conta</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium text-muted-foreground">Nome</label>
              <p className="text-lg">{user.name || "Não informado"}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">Email</label>
              <p className="text-lg">{user.email || "Não informado"}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">Método de Login</label>
              <p className="text-lg">{user.loginMethod || "Manus OAuth"}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">Função</label>
              <p className="text-lg capitalize">{user.role}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">Membro desde</label>
              <p className="text-lg">{new Date(user.createdAt).toLocaleDateString("pt-BR")}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Ações</CardTitle>
          </CardHeader>
          <CardContent>
            <Button
              variant="destructive"
              onClick={logout}
            >
              Fazer Logout
            </Button>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
