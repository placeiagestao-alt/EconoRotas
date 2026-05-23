import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Calendar, Plus, Trash2, Bell } from "lucide-react";

const DAYS_OF_WEEK = [
  { value: "MON", label: "Segunda" },
  { value: "TUE", label: "Terça" },
  { value: "WED", label: "Quarta" },
  { value: "THU", label: "Quinta" },
  { value: "FRI", label: "Sexta" },
  { value: "SAT", label: "Sábado" },
  { value: "SUN", label: "Domingo" },
];

export default function Schedules() {
  const [showForm, setShowForm] = useState(false);
  const [selectedDays, setSelectedDays] = useState<string[]>([]);
  const [formData, setFormData] = useState({
    routeId: "",
    recurrenceType: "once" as "once" | "daily" | "weekly",
    scheduledDate: "",
    scheduledTime: "09:00",
  });

  // Fetch data
  const routesQuery = trpc.routes.list.useQuery();
  const schedulesQuery = trpc.schedules.list.useQuery();
  const routes = routesQuery.data || [];
  const schedules = schedulesQuery.data || [];

  // Mutations
  const createScheduleMutation = trpc.schedules.create.useMutation();

  const handleDayToggle = (day: string) => {
    setSelectedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.routeId) {
      toast.error("Selecione uma rota");
      return;
    }

    if (!formData.scheduledDate) {
      toast.error("Selecione uma data");
      return;
    }

    if (formData.recurrenceType === "weekly" && selectedDays.length === 0) {
      toast.error("Selecione pelo menos um dia da semana");
      return;
    }

    try {
      await createScheduleMutation.mutateAsync({
        routeId: parseInt(formData.routeId),
        recurrenceType: formData.recurrenceType,
        scheduledDate: new Date(formData.scheduledDate),
        scheduledTime: formData.scheduledTime,
        daysOfWeek: formData.recurrenceType === "weekly" ? selectedDays.join(",") : undefined,
        nextExecution: new Date(formData.scheduledDate),
      });

      toast.success("Agendamento criado com sucesso!");
      setShowForm(false);
      setFormData({
        routeId: "",
        recurrenceType: "once",
        scheduledDate: "",
        scheduledTime: "09:00",
      });
      setSelectedDays([]);
      await schedulesQuery.refetch();
    } catch (error: any) {
      toast.error(error.message || "Erro ao criar agendamento");
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Agendamentos de Rotas</h1>
            <p className="text-muted-foreground mt-2">Configure execuções automáticas com notificações</p>
          </div>
          <Button onClick={() => setShowForm(!showForm)} className="gap-2">
            <Plus className="w-4 h-4" />
            Novo Agendamento
          </Button>
        </div>

        {/* Create Form */}
        {showForm && (
          <Card>
            <CardHeader>
              <CardTitle>Criar Novo Agendamento</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="route">Rota *</Label>
                    <Select
                      value={formData.routeId}
                      onValueChange={(value) => setFormData({ ...formData, routeId: value })}
                    >
                      <SelectTrigger id="route" className="mt-1">
                        <SelectValue placeholder="Selecione uma rota" />
                      </SelectTrigger>
                      <SelectContent>
                        {routes.map((route: any) => (
                          <SelectItem key={route.id} value={String(route.id)}>
                            {route.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="recurrence">Tipo de Recorrência *</Label>
                    <Select
                      value={formData.recurrenceType}
                      onValueChange={(value: any) => setFormData({ ...formData, recurrenceType: value })}
                    >
                      <SelectTrigger id="recurrence" className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="once">Uma Única Vez</SelectItem>
                        <SelectItem value="daily">Diariamente</SelectItem>
                        <SelectItem value="weekly">Semanalmente</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="date">Data *</Label>
                    <Input
                      id="date"
                      type="date"
                      value={formData.scheduledDate}
                      onChange={(e) => setFormData({ ...formData, scheduledDate: e.target.value })}
                      className="mt-1"
                    />
                  </div>

                  <div>
                    <Label htmlFor="time">Hora *</Label>
                    <Input
                      id="time"
                      type="time"
                      value={formData.scheduledTime}
                      onChange={(e) => setFormData({ ...formData, scheduledTime: e.target.value })}
                      className="mt-1"
                    />
                  </div>
                </div>

                {formData.recurrenceType === "weekly" && (
                  <div>
                    <Label>Dias da Semana *</Label>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-2">
                      {DAYS_OF_WEEK.map((day) => (
                        <div key={day.value} className="flex items-center space-x-2">
                          <Checkbox
                            id={day.value}
                            checked={selectedDays.includes(day.value)}
                            onCheckedChange={() => handleDayToggle(day.value)}
                          />
                          <label htmlFor={day.value} className="text-sm cursor-pointer">
                            {day.label}
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex gap-3">
                  <Button type="submit" disabled={createScheduleMutation.isPending}>
                    {createScheduleMutation.isPending ? "Criando..." : "Criar Agendamento"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowForm(false)}
                  >
                    Cancelar
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Schedules List */}
        <div className="space-y-4">
          {schedulesQuery.isLoading ? (
            <Card>
              <CardContent className="pt-6">
                <p className="text-muted-foreground">Carregando agendamentos...</p>
              </CardContent>
            </Card>
          ) : schedules.length === 0 ? (
            <Card>
              <CardContent className="pt-6">
                <p className="text-muted-foreground">Nenhum agendamento criado ainda</p>
              </CardContent>
            </Card>
          ) : (
            schedules.map((schedule: any) => (
              <Card key={schedule.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-blue-100 rounded-lg">
                        <Calendar className="w-4 h-4 text-blue-600" />
                      </div>
                      <div>
                        <CardTitle className="text-base">
                          {routes.find((r: any) => r.id === schedule.routeId)?.name || "Rota"}
                        </CardTitle>
                        <p className="text-sm text-muted-foreground">
                          {schedule.recurrenceType === "once"
                            ? "Uma única vez"
                            : schedule.recurrenceType === "daily"
                            ? "Diariamente"
                            : "Semanalmente"}
                        </p>
                      </div>
                    </div>
                    <Button variant="ghost" size="sm">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <p>
                    <span className="font-medium">Data Agendada:</span>{" "}
                    {new Date(schedule.scheduledDate).toLocaleDateString("pt-BR")}
                  </p>
                  <p>
                    <span className="font-medium">Hora:</span> {schedule.scheduledTime}
                  </p>
                  {schedule.daysOfWeek && (
                    <p>
                      <span className="font-medium">Dias:</span> {schedule.daysOfWeek}
                    </p>
                  )}
                  <p>
                    <span className="font-medium">Status:</span>{" "}
                    <span className={schedule.isActive ? "text-green-600" : "text-gray-600"}>
                      {schedule.isActive ? "Ativo" : "Inativo"}
                    </span>
                  </p>
                  <div className="flex items-center gap-2 text-blue-600 pt-2">
                    <Bell className="w-4 h-4" />
                    <span>Notificações ativadas</span>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {/* Info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Sobre Agendamentos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>✓ Crie agendamentos para executar rotas automaticamente</p>
            <p>✓ Escolha entre execução única, diária ou semanal</p>
            <p>✓ Receba notificações antes de cada execução</p>
            <p>✓ Acompanhe o histórico de execuções</p>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
