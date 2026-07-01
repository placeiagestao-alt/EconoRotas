import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { accountStatusLabel } from "@shared/accountAccess";
import {
  Ban,
  CheckCircle2,
  Clock3,
  Eye,
  CirclePause,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

type StatusFilter =
  | "pending_review"
  | "approved"
  | "waitlist"
  | "blocked"
  | "all";

type ReviewAction = "approved" | "waitlist" | "blocked" | "suspended";

const statusTabs: Array<{ value: StatusFilter; label: string }> = [
  { value: "pending_review", label: "Pendentes" },
  { value: "approved", label: "Aprovados" },
  { value: "waitlist", label: "Lista de espera" },
  { value: "blocked", label: "Bloqueados" },
  { value: "all", label: "Todos" },
];

function formatDate(value: unknown) {
  if (!value) return "-";
  return new Date(value as string | Date).toLocaleString("pt-BR");
}

function statusBadgeClass(status: string) {
  if (status === "approved") {
    return "border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-600";
  }
  if (status === "waitlist") {
    return "border-amber-500 bg-amber-100 text-amber-950 hover:bg-amber-100";
  }
  if (status === "blocked" || status === "suspended") {
    return "border-red-600 bg-red-600 text-white hover:bg-red-600";
  }
  return "border-sky-500 bg-sky-100 text-sky-950 hover:bg-sky-100";
}

function Stat({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  icon: typeof Users;
}) {
  return (
    <div className="rounded-lg border border-border/80 bg-white p-3 text-slate-950">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase text-slate-500">{label}</p>
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
    </div>
  );
}

function SettingNumber({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input
        type="number"
        min={1}
        value={value}
        onChange={event => onChange(Math.max(1, Number(event.target.value || 1)))}
      />
    </div>
  );
}

function SettingSwitch({
  label,
  checked,
  onCheckedChange,
}: {
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border/80 p-3">
      <Label className="text-sm">{label}</Label>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

export function AccessRequestsPanel() {
  const utils = trpc.useUtils();
  const [status, setStatus] = useState<StatusFilter>("pending_review");
  const [search, setSearch] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [settingsDraft, setSettingsDraft] = useState<any>(null);

  const accessQuery = trpc.admin.accessRequests.useQuery({
    status,
    search,
    page: 1,
    limit: 50,
  });
  const detailsQuery = trpc.admin.accessRequestDetails.useQuery(
    { userId: selectedUserId ?? 0 },
    { enabled: Boolean(selectedUserId) }
  );

  useEffect(() => {
    if (accessQuery.data?.settings) {
      setSettingsDraft(accessQuery.data.settings);
    }
  }, [accessQuery.data?.settings]);

  const reviewMutation = trpc.admin.reviewAccessRequest.useMutation({
    onSuccess: async () => {
      toast.success("Status de acesso atualizado.");
      setNote("");
      await utils.admin.accessRequests.invalidate();
      await utils.admin.accessRequestDetails.invalidate();
      await utils.admin.dashboard.invalidate();
    },
    onError: error => toast.error(error.message),
  });

  const settingsMutation = trpc.admin.updateBetaAccessSettings.useMutation({
    onSuccess: async () => {
      toast.success("Capacidade do beta atualizada.");
      await utils.admin.accessRequests.invalidate();
      await utils.admin.dashboard.invalidate();
    },
    onError: error => toast.error(error.message),
  });

  const users = accessQuery.data?.users ?? [];
  const summary = accessQuery.data?.summary;
  const capacityLabel = useMemo(() => {
    if (!summary) return "0 / 50";
    return `${summary.approvedUsers ?? 0} / ${summary.maxApprovedUsers ?? 50}`;
  }, [summary]);

  const runAction = (userId: number, action: ReviewAction) => {
    reviewMutation.mutate({
      userId,
      action,
      note: note.trim() || undefined,
    });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              Solicitacoes de Acesso
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Controle manual da fase beta, lista de espera e bloqueios.
            </p>
          </div>
          <div className="w-full xl:w-80">
            <Input
              placeholder="Buscar nome, e-mail, WhatsApp ou cidade"
              value={search}
              onChange={event => setSearch(event.target.value)}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <Stat label="Total pendente" value={summary?.pendingTotal ?? 0} icon={Clock3} />
          <Stat label="Aprovados hoje" value={summary?.approvedToday ?? 0} icon={CheckCircle2} />
          <Stat label="Lista de espera" value={summary?.waitlistTotal ?? 0} icon={Clock3} />
          <Stat label="Bloqueados" value={summary?.blockedTotal ?? 0} icon={Ban} />
          <Stat label="Capacidade atual" value={capacityLabel} icon={Users} />
        </div>

        <Tabs value={status} onValueChange={value => setStatus(value as StatusFilter)}>
          <TabsList className="flex h-auto flex-wrap justify-start">
            {statusTabs.map(tab => (
              <TabsTrigger key={tab.value} value={tab.value}>
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="overflow-x-auto rounded-lg border border-border/80">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>E-mail</TableHead>
                <TableHead>WhatsApp</TableHead>
                <TableHead>Cidade/UF</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Marketplace</TableHead>
                <TableHead>Paradas/dia</TableHead>
                <TableHead>Cadastro</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Acoes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {accessQuery.isLoading ? (
                <TableRow>
                  <TableCell colSpan={10}>Carregando solicitacoes...</TableCell>
                </TableRow>
              ) : users.length ? (
                users.map((user: any) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">{user.name || "-"}</TableCell>
                    <TableCell>{user.email || "-"}</TableCell>
                    <TableCell>{user.phone || "-"}</TableCell>
                    <TableCell>
                      {[user.city, user.state].filter(Boolean).join("/") || "-"}
                    </TableCell>
                    <TableCell>{user.userType || "-"}</TableCell>
                    <TableCell>{user.marketplace || "-"}</TableCell>
                    <TableCell>{user.averageStopsPerDay ?? "-"}</TableCell>
                    <TableCell>{formatDate(user.createdAt)}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={statusBadgeClass(user.accountStatus)}
                      >
                        {accountStatusLabel(user.accountStatus)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex min-w-[260px] flex-wrap gap-2">
                        <Button
                          size="sm"
                          disabled={reviewMutation.isPending}
                          onClick={() => runAction(user.id, "approved")}
                        >
                          Aprovar
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={reviewMutation.isPending}
                          onClick={() => runAction(user.id, "waitlist")}
                        >
                          Lista
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={reviewMutation.isPending}
                          onClick={() => runAction(user.id, "blocked")}
                        >
                          Bloquear
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => setSelectedUserId(user.id)}
                          aria-label="Ver detalhes"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={10}>Nenhum cadastro neste filtro.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {settingsDraft ? (
          <div className="rounded-lg border border-border/80 p-4">
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-base font-semibold">Capacidade do Beta</h3>
                <p className="text-sm text-muted-foreground">
                  Limites usados no cadastro e nas funcoes pesadas do app.
                </p>
              </div>
              <Button
                disabled={settingsMutation.isPending}
                onClick={() => settingsMutation.mutate(settingsDraft)}
              >
                {settingsMutation.isPending ? "Salvando..." : "Salvar capacidade"}
              </Button>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <SettingNumber
                label="Maximo de usuarios aprovados"
                value={settingsDraft.maxApprovedUsers}
                onChange={value =>
                  setSettingsDraft({ ...settingsDraft, maxApprovedUsers: value })
                }
              />
              <SettingNumber
                label="Rotas por usuario/dia"
                value={settingsDraft.routesPerUserPerDay}
                onChange={value =>
                  setSettingsDraft({ ...settingsDraft, routesPerUserPerDay: value })
                }
              />
              <SettingNumber
                label="Paradas por rota"
                value={settingsDraft.stopsPerRouteLimit}
                onChange={value =>
                  setSettingsDraft({ ...settingsDraft, stopsPerRouteLimit: value })
                }
              />
              <SettingNumber
                label="Importacoes por hora"
                value={settingsDraft.importsPerHourLimit}
                onChange={value =>
                  setSettingsDraft({ ...settingsDraft, importsPerHourLimit: value })
                }
              />
              <SettingNumber
                label="Tamanho maximo de arquivo MB"
                value={settingsDraft.maxFileSizeMb}
                onChange={value =>
                  setSettingsDraft({ ...settingsDraft, maxFileSizeMb: value })
                }
              />
              <SettingSwitch
                label="Permitir novos cadastros"
                checked={settingsDraft.allowNewRegistrations}
                onCheckedChange={checked =>
                  setSettingsDraft({
                    ...settingsDraft,
                    allowNewRegistrations: checked,
                  })
                }
              />
              <SettingSwitch
                label="Aprovacao automatica"
                checked={settingsDraft.automaticApproval}
                onCheckedChange={checked =>
                  setSettingsDraft({ ...settingsDraft, automaticApproval: checked })
                }
              />
              <SettingSwitch
                label="Novos usuarios direto na lista"
                checked={settingsDraft.sendNewUsersToWaitlist}
                onCheckedChange={checked =>
                  setSettingsDraft({
                    ...settingsDraft,
                    sendNewUsersToWaitlist: checked,
                  })
                }
              />
              <SettingSwitch
                label="Modo manutencao"
                checked={settingsDraft.maintenanceMode}
                onCheckedChange={checked =>
                  setSettingsDraft({ ...settingsDraft, maintenanceMode: checked })
                }
              />
            </div>
          </div>
        ) : null}
      </CardContent>

      <Dialog
        open={Boolean(selectedUserId)}
        onOpenChange={open => {
          if (!open) {
            setSelectedUserId(null);
            setNote("");
          }
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalhes do usuario</DialogTitle>
            <DialogDescription>
              Dados de cadastro, historico de decisoes e observacoes internas.
            </DialogDescription>
          </DialogHeader>

          {detailsQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando detalhes...</p>
          ) : detailsQuery.data ? (
            <div className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  ["Nome", detailsQuery.data.user.name],
                  ["E-mail", detailsQuery.data.user.email],
                  ["WhatsApp", detailsQuery.data.user.phone],
                  [
                    "Cidade/UF",
                    [detailsQuery.data.user.city, detailsQuery.data.user.state]
                      .filter(Boolean)
                      .join("/"),
                  ],
                  ["Tipo de usuario", detailsQuery.data.user.userType],
                  ["Marketplace", detailsQuery.data.user.marketplace],
                  ["Media de paradas", detailsQuery.data.user.averageStopsPerDay],
                  ["Cadastro", formatDate(detailsQuery.data.user.createdAt)],
                  ["Ultimo login", formatDate(detailsQuery.data.user.lastSignedIn)],
                  [
                    "Status atual",
                    accountStatusLabel(detailsQuery.data.user.accountStatus),
                  ],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-lg border border-border/80 p-3">
                    <p className="text-xs font-medium uppercase text-muted-foreground">
                      {label}
                    </p>
                    <p className="mt-1 text-sm font-medium">{value || "-"}</p>
                  </div>
                ))}
              </div>

              <div className="space-y-2">
                <Label htmlFor="access-review-note">Observacoes internas</Label>
                <Textarea
                  id="access-review-note"
                  value={note}
                  onChange={event => setNote(event.target.value)}
                  placeholder="Motivo da decisao, contexto de suporte ou observacao operacional."
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={reviewMutation.isPending}
                  onClick={() => runAction(detailsQuery.data.user.id, "approved")}
                >
                  Aprovar
                </Button>
                <Button
                  variant="outline"
                  disabled={reviewMutation.isPending}
                  onClick={() => runAction(detailsQuery.data.user.id, "waitlist")}
                >
                  Mover para lista
                </Button>
                <Button
                  variant="outline"
                  disabled={reviewMutation.isPending}
                  onClick={() => runAction(detailsQuery.data.user.id, "blocked")}
                >
                  Bloquear
                </Button>
                <Button
                  variant="outline"
                  className="gap-2"
                  disabled={reviewMutation.isPending}
                  onClick={() => runAction(detailsQuery.data.user.id, "suspended")}
                >
                  <CirclePause className="h-4 w-4" />
                  Suspender
                </Button>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <div>
                  <h4 className="mb-2 text-sm font-semibold">
                    Historico de decisoes
                  </h4>
                  <div className="space-y-2">
                    {detailsQuery.data.reviews.length ? (
                      detailsQuery.data.reviews.map((review: any) => (
                        <div
                          key={review.id}
                          className="rounded-lg border border-border/80 p-3 text-sm"
                        >
                          <p className="font-medium">
                            {accountStatusLabel(review.previousStatus)}
                            {" -> "}
                            {accountStatusLabel(review.newStatus)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatDate(review.createdAt)} por{" "}
                            {review.adminName || review.adminEmail || "admin"}
                          </p>
                          {review.note ? (
                            <p className="mt-1 text-muted-foreground">
                              {review.note}
                            </p>
                          ) : null}
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Nenhuma decisao registrada.
                      </p>
                    )}
                  </div>
                </div>

                <div>
                  <h4 className="mb-2 text-sm font-semibold">E-mails enviados</h4>
                  <div className="space-y-2">
                    {detailsQuery.data.emailLogs.length ? (
                      detailsQuery.data.emailLogs.map((log: any) => (
                        <div
                          key={log.id ?? `${log.templateName}-${log.createdAt}`}
                          className="rounded-lg border border-border/80 p-3 text-sm"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <p className="font-medium">{log.templateName}</p>
                            <Badge variant="outline">{log.status}</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {formatDate(log.createdAt)}
                          </p>
                          {log.error ? (
                            <p className="mt-1 text-xs text-muted-foreground">
                              {log.error}
                            </p>
                          ) : null}
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Nenhum e-mail registrado.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Usuario nao encontrado.
            </p>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
