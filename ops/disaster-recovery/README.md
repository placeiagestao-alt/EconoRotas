# Disaster Recovery

Sprint 5 torna o Disaster Recovery evidenciavel. O painel so deve ficar
healthy quando existir backup recente e teste de restore aprovado.

## Objetivo

- Gerar um backup logico do MySQL de producao.
- Restaurar esse backup em um banco descartavel.
- Validar contagem de linhas por tabela.
- Registrar eventos operacionais somente depois da validacao:
  - `backup_completed`
  - `restore_test_passed`

Em caso de erro, o script registra `backup_failed` ou `restore_test_failed`
quando ainda consegue escrever no banco de origem.

## Variaveis obrigatorias

```env
DATABASE_URL=mysql://...
RESTORE_TEST_DATABASE_URL=mysql://...
DR_RESTORE_CONFIRM_DATABASE=nome_do_banco_descartavel
```

Quando o banco descartavel fica no mesmo servidor de `DATABASE_URL`, substitua
`RESTORE_TEST_DATABASE_URL` por:

```env
DR_RESTORE_DATABASE_NAME=nome_do_banco_descartavel
DR_RESTORE_CONFIRM_DATABASE=nome_do_banco_descartavel
```

`DR_RESTORE_CONFIRM_DATABASE` deve ser exatamente o nome do banco apontado por
`RESTORE_TEST_DATABASE_URL` ou `DR_RESTORE_DATABASE_NAME`. Isso evita reset
acidental de um banco real.

O banco de restore deve ter nome claramente descartavel, contendo termos como
`restore`, `drill`, `backup`, `test`, `homolog`, `staging` ou `evidenc`.

## Variaveis opcionais

```env
DR_BACKUP_DIR=backups/disaster-recovery
DR_BACKUP_BATCH_SIZE=1000
DR_DB_CONNECTION_LIMIT=2
DR_RESTORE_ALLOW_ANY_TARGET=false
DR_RPO_HOURS=24
DR_RTO_HOURS=4
DR_RESTORE_MAX_AGE_HOURS=168
DR_RETENTION_DAYS=14
DR_SCHEDULE_ENABLED=false
```

Use `DR_RESTORE_ALLOW_ANY_TARGET=true` somente quando o alvo foi revisado e e
descartavel. O script apaga as tabelas existentes no banco de restore antes de
validar o backup.

Mude `DR_SCHEDULE_ENABLED` para `true` somente depois que o agendador externo
for verificado. Nao use `true` antes de confirmar a task/cron e sua ultima
execucao.
`DR_RETENTION_DAYS` define a politica observada; o EconoRotas nao apaga backups
automaticamente.

## Metas iniciais

- RPO: backup concluido nas ultimas 24 horas.
- RTO: restore completo em ate 4 horas.
- Restore drill: pelo menos uma vez a cada 168 horas (7 dias).
- Retencao: 14 dias, nunca abaixo de 7 dias no beta.
- Recorrencia comprovada: pelo menos dois backups e dois restores aprovados no
  historico operacional recente.

## Execucao

Validar configuracao sem conectar nem escrever:

```powershell
corepack pnpm@10.33.4 run check:disaster-recovery
```

Executar o drill completo:

```powershell
corepack pnpm@10.33.4 run drill:disaster-recovery
```

Esse comando le o banco de origem, cria um novo arquivo de backup, apaga apenas
as tabelas do banco descartavel confirmado e grava eventos no banco de origem.
Nunca execute sem revisar o alvo e `DR_RESTORE_CONFIRM_DATABASE`.

Executar a rotina diaria manualmente:

```powershell
corepack pnpm@10.33.4 run dr:daily
```

Registrar a rotina diaria no Windows Task Scheduler:

```powershell
corepack pnpm@10.33.4 run dr:register-task
```

A task criada e `EconoRotasDisasterRecoveryDaily`, roda diariamente as 03:15,
usa `scripts/run-disaster-recovery-daily.ps1` e grava log em
`logs/disaster-recovery-daily.log`. O registro nao dispara novo drill na hora;
para iniciar imediatamente, rode `scripts/register-disaster-recovery-task.ps1
-StartNow`. O runner executa o drill completo e so mantem o painel dentro do
RPO quando consegue gravar `backup_completed` e `restore_test_passed`.

O backup local e gravado em `backups/disaster-recovery` e essa pasta e ignorada
pelo Git.

## Evidencia no painel

Depois de um drill aprovado, o painel de Operacoes passa a encontrar evidencia
real em `operationalEvents`. `/api/monitor/ping` informa:

- `lastBackupAt`, `backupAgeHours`, `backupStatus` e `backupWithinRpo`;
- `restoreTestAt`, `restoreAgeHours`, `restoreStatus` e
  `restoreWithinWindow`;
- `restoreDurationMs` e `rtoMet`;
- RPO, RTO, validade do restore e retencao configurados;
- contadores em `history`, `reason`, `reasons` e `nextAction`;
- variaveis de politica ausentes em `configuration.missingVariables`.

Interpretacao:

- `ok`: backup e restore recentes, RTO atendido, politica e recorrencia
  comprovadas;
- `attention`: operacao valida, mas configuracao, duracao ou recorrencia ainda
  nao estao totalmente comprovadas;
- `warning`: backup fora do RPO, restore vencido, RTO excedido ou retencao
  abaixo de 7 dias;
- `no-go`: backup ausente/falho, restore ausente/falho ou tabela critica
  inacessivel.

Uma falha mais recente sempre vence flags antigas de ambiente. Portanto,
`RESTORE_TEST_PASSED=true` sem timestamp valido nao torna o DR saudavel.

## Frequencia e retencao

No beta, execute backup diariamente e restore drill semanalmente. A rotina
atual executa ambos diariamente, o que e mais conservador e aceitavel.

Mantenha copias por 7 a 14 dias em armazenamento separado do banco de origem.
Antes de qualquer limpeza, confirme integridade, sincronizacao externa e pelo
menos um restore recente. Este projeto nao remove backups automaticamente.

## Resposta a falhas

1. `backup_failed` ou backup fora do RPO: preservar logs, corrigir acesso/disco
   e executar novo backup.
2. `restore_test_failed`: bloquear promocao comercial, revisar o banco
   descartavel e repetir o drill.
3. Restore acima do RTO: medir gargalo de leitura, rede e insercao antes do
   proximo teste.
4. Task atrasada: conferir `Get-ScheduledTaskInfo`, energia, credenciais e
   `logs/disaster-recovery-daily.log`.
5. Nunca testar restore contra o banco de origem.

## Regra de release

Esta sprint e infraestrutura operacional. Nao misturar com motor de rota nem UX
no mesmo commit/release, salvo correcao emergencial.

## Fila Redis

BullMQ exige Redis sem eviction para nao perder jobs, locks ou heartbeats sob
pressao de memoria. A politica operacional e `maxmemory-policy=noeviction`.

Verificar e tentar aplicar via comando:

```powershell
corepack pnpm@10.33.4 run redis:enforce-noeviction -- --apply
```

Alguns provedores gerenciados bloqueiam `CONFIG SET`. Nesse caso, ajuste a
politica no painel/API do provedor ou crie uma instancia Redis nova ja com
`noeviction`, depois rode:

```powershell
corepack pnpm@10.33.4 run check:optimization-infra
```
