import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getPrivacyPolicyUrl, getTermlyPolicyGeneratorUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { AlertTriangle, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";

function isProfileIncomplete(user: any) {
  return !user?.name || !user?.phone || !user?.city || !user?.state || !user?.vehicleType;
}

export default function Profile() {
  const { user, loading, logout } = useAuth();
  const utils = trpc.useUtils();
  const privacyPolicyUrl = getPrivacyPolicyUrl();
  const termlyGeneratorUrl = getTermlyPolicyGeneratorUrl();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [city, setCity] = useState("");
  const [stateUf, setStateUf] = useState("");
  const [vehicleType, setVehicleType] = useState("");
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);

  const incompleteProfile = useMemo(() => isProfileIncomplete(user), [user]);

  useEffect(() => {
    if (!user) return;
    setName(user.name ?? "");
    setPhone((user as any).phone ?? "");
    setCompanyName((user as any).companyName ?? "");
    setCity((user as any).city ?? "");
    setStateUf((user as any).state ?? "");
    setVehicleType((user as any).vehicleType ?? "");
    setAcceptTerms(Boolean((user as any).acceptedTermsAt));
  }, [user]);

  const updateProfileMutation = trpc.auth.updateProfile.useMutation({
    onSuccess: async () => {
      setProfileError(null);
      setProfileMessage("Cadastro atualizado com sucesso.");
      await utils.auth.me.invalidate();
    },
    onError: (error) => {
      setProfileMessage(null);
      setProfileError(error.message);
    },
  });

  const openExternalLink = (url: string) => {
    const popup = window.open(url, "_blank", "noopener,noreferrer");
    if (popup) return;
    window.location.href = url;
  };

  const handleProfileSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setProfileError(null);
    setProfileMessage(null);

    await updateProfileMutation.mutateAsync({
      name,
      phone,
      companyName,
      city,
      state: stateUf,
      vehicleType,
      acceptTerms,
    });
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
            <p className="text-muted-foreground">Usuario nao autenticado</p>
          </CardContent>
        </Card>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <h1 className="text-4xl font-bold tracking-tight">Meu Perfil</h1>

        {incompleteProfile && (
          <Alert className="border-amber-300 bg-amber-50 text-amber-950">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Complete seu cadastro</AlertTitle>
            <AlertDescription>
              Esses dados ajudam no suporte, auditoria de uso e controle operacional.
            </AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Dados basicos</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="grid gap-4 sm:grid-cols-2" onSubmit={handleProfileSubmit}>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="profile-name">Nome completo</Label>
                <Input
                  id="profile-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  disabled={updateProfileMutation.isPending}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="profile-phone">Telefone/WhatsApp</Label>
                <Input
                  id="profile-phone"
                  autoComplete="tel"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  disabled={updateProfileMutation.isPending}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="profile-vehicle">Veiculo</Label>
                <Input
                  id="profile-vehicle"
                  placeholder="Moto, carro, van..."
                  value={vehicleType}
                  onChange={(event) => setVehicleType(event.target.value)}
                  disabled={updateProfileMutation.isPending}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="profile-city">Cidade</Label>
                <Input
                  id="profile-city"
                  autoComplete="address-level2"
                  value={city}
                  onChange={(event) => setCity(event.target.value)}
                  disabled={updateProfileMutation.isPending}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="profile-state">Estado</Label>
                <Input
                  id="profile-state"
                  autoComplete="address-level1"
                  value={stateUf}
                  onChange={(event) => setStateUf(event.target.value)}
                  disabled={updateProfileMutation.isPending}
                  required
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="profile-company">Empresa/Operacao</Label>
                <Input
                  id="profile-company"
                  value={companyName}
                  onChange={(event) => setCompanyName(event.target.value)}
                  disabled={updateProfileMutation.isPending}
                  placeholder="Opcional"
                />
              </div>

              {!user.acceptedTermsAt && (
                <label className="flex items-start gap-3 rounded-xl border border-border/80 bg-secondary/45 p-3 text-sm text-slate-700 sm:col-span-2">
                  <input
                    type="checkbox"
                    checked={acceptTerms}
                    onChange={(event) => setAcceptTerms(event.target.checked)}
                    className="mt-1 h-4 w-4 accent-emerald-600"
                    required
                  />
                  <span>
                    Confirmo que os dados informados sao corretos e aceito o uso
                    operacional do EconoRota para roteirizacao e suporte.
                  </span>
                </label>
              )}

              {profileError && (
                <p className="text-sm text-red-600 sm:col-span-2">{profileError}</p>
              )}
              {profileMessage && (
                <p className="text-sm text-emerald-700 sm:col-span-2">{profileMessage}</p>
              )}

              <div className="sm:col-span-2">
                <Button type="submit" disabled={updateProfileMutation.isPending}>
                  {updateProfileMutation.isPending ? "Salvando..." : "Salvar cadastro"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Informacoes da Conta</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium text-muted-foreground">E-mail</label>
              <p className="text-lg">{user.email || "Nao informado"}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">Metodo de Login</label>
              <p className="text-lg">{user.loginMethod || "OAuth"}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">Funcao</label>
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
            <CardTitle>Acoes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => openExternalLink(privacyPolicyUrl)}
            >
              Politica de Privacidade
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => openExternalLink(termlyGeneratorUrl)}
            >
              Gerar/Editar politica no Termly
            </Button>
            <p className="text-xs text-muted-foreground">
              Para usar sua propria politica, configure VITE_PRIVACY_POLICY_URL no build.
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
