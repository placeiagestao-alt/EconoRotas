import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getPrivacyPolicyUrl, getTermlyPolicyGeneratorUrl } from "@/const";
import { Loader2 } from "lucide-react";

export default function Profile() {
  const { user, loading, logout } = useAuth();
  const privacyPolicyUrl = getPrivacyPolicyUrl();
  const termlyGeneratorUrl = getTermlyPolicyGeneratorUrl();

  const openExternalLink = (url: string) => {
    const popup = window.open(url, "_blank", "noopener,noreferrer");
    if (popup) return;
    window.location.href = url;
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin" />
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
        <h1 className="text-4xl font-bold tracking-tight">Meu Perfil</h1>

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
              <label className="text-sm font-medium text-muted-foreground">E-mail</label>
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
              <p className="text-lg">
                {new Date(user.createdAt).toLocaleDateString("pt-BR")}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
              <CardTitle>Ações</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => openExternalLink(privacyPolicyUrl)}
            >
              Pol\u00edtica de Privacidade
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => openExternalLink(termlyGeneratorUrl)}
            >
              Gerar/Editar pol\u00edtica no Termly
            </Button>
            <p className="text-xs text-muted-foreground">
              Para usar sua própria política, configure VITE_PRIVACY_POLICY_URL no build.
            </p>
            <Button variant="destructive" onClick={logout}>
              Sair da conta
            </Button>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
