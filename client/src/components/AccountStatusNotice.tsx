import { useAuth } from "@/_core/hooks/useAuth";
import { BrandLogo } from "@/components/BrandLogo";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { accountStatusLabel } from "@shared/accountAccess";
import {
  Clock3,
  LogOut,
  MailCheck,
  ShieldAlert,
  UserRoundCheck,
} from "lucide-react";

const SUPPORT_WHATSAPP_URL =
  "https://wa.me/5518996531491?text=Ola%2C%20preciso%20de%20suporte%20sobre%20meu%20acesso%20ao%20EconoRota.";

function statusContent(status: string | null | undefined) {
  if (status === "waitlist") {
    return {
      icon: Clock3,
      title: "Lista de espera para testes",
      text:
        "Seu cadastro foi recebido e esta na lista de espera. Estamos liberando acessos aos poucos para manter estabilidade e suporte.",
      tone: "border-amber-200 bg-amber-50 text-amber-900",
    };
  }

  if (status === "blocked" || status === "suspended") {
    return {
      icon: ShieldAlert,
      title: "Acesso indisponivel",
      text:
        "Sua conta nao esta liberada para uso neste momento. Fale com o suporte se precisar revisar seu acesso.",
      tone: "border-red-200 bg-red-50 text-red-900",
    };
  }

  return {
    icon: MailCheck,
    title: "Cadastro em analise",
    text:
      "Recebemos seu pedido de acesso. Assim que o admin liberar sua conta, voce podera entrar, importar entregas e criar rotas.",
    tone: "border-emerald-200 bg-emerald-50 text-emerald-900",
  };
}

export function AccountStatusNotice() {
  const { user, logout, refresh } = useAuth();
  const accountStatus = (user as any)?.accountStatus as string | undefined;
  const content = statusContent(accountStatus);
  const Icon = content.icon;

  return (
    <div className="min-h-screen bg-[#f8fafc] px-4 py-6 text-slate-950">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
        <BrandLogo variant="full" className="h-16 w-56 justify-start" />

        <Card className="border-slate-200 bg-white shadow-[0_24px_60px_rgb(15_23_42_/_10%)]">
          <CardHeader className="space-y-4">
            <div
              className={`inline-flex w-fit items-center gap-2 rounded-full border px-3 py-2 text-sm font-semibold ${content.tone}`}
            >
              <Icon className="h-4 w-4" />
              {accountStatusLabel(accountStatus)}
            </div>
            <div>
              <CardTitle className="text-2xl font-bold tracking-normal">
                {content.title}
              </CardTitle>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {content.text}
              </p>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-start gap-3">
                <UserRoundCheck className="mt-0.5 h-5 w-5 text-emerald-700" />
                <div>
                  <p className="text-sm font-semibold">
                    {user?.name || "Cadastro recebido"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {user?.email || "E-mail nao informado"}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-3">
              <Button type="button" onClick={() => refresh()}>
                Atualizar status
              </Button>
              <Button type="button" variant="outline" asChild>
                <a href={SUPPORT_WHATSAPP_URL} target="_blank" rel="noreferrer">
                  Falar com suporte
                </a>
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="gap-2"
                onClick={() => logout()}
              >
                <LogOut className="h-4 w-4" />
                Sair
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
