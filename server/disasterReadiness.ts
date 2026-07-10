export type DisasterReadinessStatus = "ok" | "attention" | "warning" | "no-go";

export type DisasterEvidenceStatus = "passed" | "failed" | "missing";

export type DisasterReadinessIssue = {
  type: string;
  level: Exclude<DisasterReadinessStatus, "ok">;
  title: string;
  message: string;
  action: string;
  metadata?: Record<string, unknown>;
};

export type DisasterReadinessInput = {
  now?: Date;
  rpoTargetHours: number;
  rtoTargetHours: number;
  restoreMaxAgeHours: number;
  retentionDays: number;
  policyExplicit: boolean;
  scheduleEnabled: boolean;
  lastBackupAt: Date | null;
  backupStatus: "completed" | "failed" | "unknown";
  restoreTestAt: Date | null;
  restoreStatus: DisasterEvidenceStatus;
  restoreDurationMs: number | null;
  history: {
    backupCompleted: number;
    backupFailed: number;
    restorePassed: number;
    restoreFailed: number;
  };
  tableErrors: Array<{
    table: string;
    status: string;
    error?: string;
  }>;
};

function ageHours(date: Date | null, now: Date) {
  if (!date) return null;
  return (
    Math.max(
      0,
      Math.round(((now.getTime() - date.getTime()) / 3_600_000) * 10)
    ) / 10
  );
}

function statusRank(status: DisasterReadinessStatus) {
  if (status === "no-go") return 4;
  if (status === "warning") return 3;
  if (status === "attention") return 2;
  return 1;
}

export function evaluateDisasterReadiness(input: DisasterReadinessInput) {
  const now = input.now ?? new Date();
  const backupAgeHours = ageHours(input.lastBackupAt, now);
  const restoreAgeHours = ageHours(input.restoreTestAt, now);
  const restoreDurationHours =
    input.restoreDurationMs === null
      ? null
      : Math.round((input.restoreDurationMs / 3_600_000) * 100) / 100;
  const recurringEvidence =
    input.history.backupCompleted >= 2 && input.history.restorePassed >= 2;
  const issues: DisasterReadinessIssue[] = [];

  if (!input.lastBackupAt) {
    issues.push({
      type: "backup_missing",
      level: "no-go",
      title: "Backup sem evidencia",
      message: "Nenhum backup concluido foi encontrado.",
      action:
        "Executar a rotina de backup e confirmar o evento backup_completed.",
      metadata: { rpoTargetHours: input.rpoTargetHours },
    });
  } else if (input.backupStatus === "failed") {
    issues.push({
      type: "backup_failed",
      level: "no-go",
      title: "Ultimo backup falhou",
      message: "A evidencia mais recente de backup indica falha.",
      action: "Corrigir a causa da falha e executar um novo backup completo.",
      metadata: { backupAgeHours },
    });
  } else if ((backupAgeHours ?? 0) > input.rpoTargetHours) {
    issues.push({
      type: "backup_stale",
      level: "warning",
      title: "Backup fora do RPO",
      message: `Ultimo backup tem ${backupAgeHours}h; a meta e ${input.rpoTargetHours}h.`,
      action: "Executar o backup agora e revisar a recorrencia do agendamento.",
      metadata: {
        backupAgeHours,
        rpoTargetHours: input.rpoTargetHours,
      },
    });
  }

  if (input.restoreStatus === "failed") {
    issues.push({
      type: "restore_test_failed",
      level: "no-go",
      title: "Ultimo restore drill falhou",
      message: "A evidencia mais recente de restore indica falha.",
      action:
        "Corrigir o restore em banco descartavel e repetir o drill antes de liberar operacao.",
    });
  } else if (input.restoreStatus === "missing" || !input.restoreTestAt) {
    issues.push({
      type: "restore_test_missing",
      level: "no-go",
      title: "Restore drill sem evidencia",
      message: "Nao existe restore drill aprovado e verificavel.",
      action:
        "Executar restore drill somente em banco descartavel e validar as tabelas.",
    });
  } else {
    if ((restoreAgeHours ?? 0) > input.restoreMaxAgeHours) {
      issues.push({
        type: "restore_test_stale",
        level: "warning",
        title: "Restore drill vencido",
        message: `Ultimo restore aprovado tem ${restoreAgeHours}h; a janela e ${input.restoreMaxAgeHours}h.`,
        action: "Executar um novo restore drill no banco descartavel.",
        metadata: {
          restoreAgeHours,
          restoreMaxAgeHours: input.restoreMaxAgeHours,
        },
      });
    }

    if (restoreDurationHours === null) {
      issues.push({
        type: "restore_rto_unverified",
        level: "attention",
        title: "RTO sem duracao comprovada",
        message: "O restore foi aprovado, mas sua duracao nao esta registrada.",
        action: "Executar um novo drill que registre restore.durationMs.",
        metadata: { rtoTargetHours: input.rtoTargetHours },
      });
    } else if (restoreDurationHours > input.rtoTargetHours) {
      issues.push({
        type: "restore_rto_missed",
        level: "warning",
        title: "Restore acima do RTO",
        message: `Restore levou ${restoreDurationHours}h; a meta e ${input.rtoTargetHours}h.`,
        action: "Otimizar o procedimento de restore e repetir a medicao.",
        metadata: {
          restoreDurationHours,
          rtoTargetHours: input.rtoTargetHours,
        },
      });
    }
  }

  for (const table of input.tableErrors) {
    issues.push({
      type: "restore_table_unavailable",
      level: "no-go",
      title: `Tabela critica inacessivel: ${table.table}`,
      message: table.error ?? "Tabela critica nao respondeu a verificacao.",
      action: "Restaurar acesso a tabela critica e repetir a verificacao.",
      metadata: { table: table.table, status: table.status },
    });
  }

  if (!input.policyExplicit) {
    issues.push({
      type: "dr_policy_defaulted",
      level: "attention",
      title: "Politica DR usa valores padrao",
      message:
        "RPO, RTO, validade do restore ou retencao nao foram explicitados.",
      action:
        "Configurar DR_RPO_HOURS, DR_RTO_HOURS, DR_RESTORE_MAX_AGE_HOURS e DR_RETENTION_DAYS.",
    });
  }

  if (!input.scheduleEnabled) {
    issues.push({
      type: "dr_schedule_unconfirmed",
      level: "attention",
      title: "Agendamento DR nao confirmado",
      message: "DR_SCHEDULE_ENABLED nao confirma uma rotina recorrente ativa.",
      action:
        "Validar o agendador operacional e definir DR_SCHEDULE_ENABLED=true.",
    });
  }

  if (!recurringEvidence) {
    issues.push({
      type: "dr_recurrence_unproven",
      level: "attention",
      title: "Recorrencia DR ainda nao comprovada",
      message:
        "O historico ainda nao possui dois backups e dois restores aprovados.",
      action: "Manter a rotina ativa ate formar evidencia recorrente.",
      metadata: input.history,
    });
  }

  if (input.retentionDays < 7) {
    issues.push({
      type: "dr_retention_insufficient",
      level: "warning",
      title: "Retencao abaixo do minimo",
      message: `Retencao configurada em ${input.retentionDays} dias; o minimo beta e 7 dias.`,
      action: "Configurar DR_RETENTION_DAYS entre 7 e 14 dias ou mais.",
      metadata: { retentionDays: input.retentionDays },
    });
  }

  const status = issues.reduce<DisasterReadinessStatus>(
    (current, issue) =>
      statusRank(issue.level) > statusRank(current) ? issue.level : current,
    "ok"
  );
  const orderedIssues = [...issues].sort(
    (left, right) => statusRank(right.level) - statusRank(left.level)
  );

  return {
    status,
    backupAgeHours,
    backupWithinRpo:
      backupAgeHours !== null && backupAgeHours <= input.rpoTargetHours,
    restoreAgeHours,
    restoreWithinWindow:
      restoreAgeHours !== null &&
      restoreAgeHours <= input.restoreMaxAgeHours &&
      input.restoreStatus === "passed",
    restoreDurationMs: input.restoreDurationMs,
    restoreDurationHours,
    rtoMet:
      restoreDurationHours !== null &&
      restoreDurationHours <= input.rtoTargetHours,
    recurringEvidence,
    reason:
      orderedIssues[0]?.message ??
      "Backup e restore estao dentro das metas configuradas.",
    reasons: orderedIssues.map(issue => issue.message),
    nextAction:
      orderedIssues[0]?.action ??
      "Manter backup diario, restore semanal e revisar as evidencias.",
    issues: orderedIssues,
  };
}
