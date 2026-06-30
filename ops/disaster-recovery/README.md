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

`DR_RESTORE_CONFIRM_DATABASE` deve ser exatamente o nome do banco apontado por
`RESTORE_TEST_DATABASE_URL`. Isso evita reset acidental de um banco real.

O banco de restore deve ter nome claramente descartavel, contendo termos como
`restore`, `drill`, `backup`, `test`, `homolog`, `staging` ou `evidenc`.

## Variaveis opcionais

```env
DR_BACKUP_DIR=backups/disaster-recovery
DR_BACKUP_BATCH_SIZE=1000
DR_DB_CONNECTION_LIMIT=2
DR_RESTORE_ALLOW_ANY_TARGET=false
```

Use `DR_RESTORE_ALLOW_ANY_TARGET=true` somente quando o alvo foi revisado e e
descartavel. O script apaga as tabelas existentes no banco de restore antes de
validar o backup.

## Execucao

Validar configuracao sem conectar nem escrever:

```powershell
corepack pnpm@10.33.4 run check:disaster-recovery
```

Executar o drill completo:

```powershell
corepack pnpm@10.33.4 run drill:disaster-recovery
```

O backup local e gravado em `backups/disaster-recovery` e essa pasta e ignorada
pelo Git.

## Evidencia no painel

Depois de um drill aprovado, o painel de Operacoes passa a encontrar evidencia
real em `operationalEvents`.

O readiness de Disaster Recovery continua em atencao ou critical quando:

- nao existe `backup_completed` recente;
- existe `backup_failed` mais novo que o ultimo backup concluido;
- nao existe `restore_test_passed` aprovado;
- alguma tabela critica nao responde.

## Regra de release

Esta sprint e infraestrutura operacional. Nao misturar com motor de rota nem UX
no mesmo commit/release, salvo correcao emergencial.
