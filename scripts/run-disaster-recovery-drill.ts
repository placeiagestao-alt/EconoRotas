import crypto from "node:crypto";
import { once } from "node:events";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import zlib from "node:zlib";
import dotenv from "dotenv";
import mysql, {
  type Pool,
  type PoolConnection,
  type RowDataPacket,
} from "mysql2/promise";

type DisasterArgs = {
  backupDir?: string;
  checkConfig: boolean;
  help: boolean;
  noRecordEvents: boolean;
};

type DatabaseTarget = {
  url: string;
  hostname: string;
  port: string;
  database: string;
  username: string;
  label: string;
};

type BackupSummary = {
  filePath: string;
  fileName: string;
  sizeBytes: number;
  sha256: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  tableCount: number;
  rowCount: number;
  tables: Array<{ table: string; rows: number }>;
};

type RestoreSummary = {
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  tableCount: number;
  rowCount: number;
  tables: Array<{ table: string; sourceRows: number; restoredRows: number }>;
};

type Queryable = Pick<Pool, "query"> | Pick<PoolConnection, "query">;

const ENV_PATHS = [
  ".env",
  ".env.local",
  ".env.production",
  ".env.worker.production",
];
const DEFAULT_BACKUP_DIR = path.join("backups", "disaster-recovery");
const DEFAULT_BATCH_SIZE = 1000;
const SAFE_TARGET_DATABASE_PATTERN =
  /(restore|drill|backup|test|homolog|staging|evidenc|scratch)/i;

function printHelp() {
  console.log(`EconoRota disaster recovery drill

Usage:
  pnpm run check:disaster-recovery
  pnpm run drill:disaster-recovery

Required environment:
  DATABASE_URL                  Source production MySQL URL.
  RESTORE_TEST_DATABASE_URL     Disposable MySQL URL used for restore validation.
  DR_RESTORE_DATABASE_NAME      Optional disposable database name on the same server.
  DR_RESTORE_CONFIRM_DATABASE   Must equal the target database name.

Optional environment:
  DR_BACKUP_DIR                 Default: ${DEFAULT_BACKUP_DIR}
  DR_BACKUP_BATCH_SIZE          Default: ${DEFAULT_BATCH_SIZE}
  DR_RESTORE_ALLOW_ANY_TARGET   Set true only when the target database is disposable.

Safety:
  The restore target is reset before validation. The source database is never dropped.
  Successful drills record backup_completed and restore_test_passed events.`);
}

function parseArgs(argv: string[]): DisasterArgs {
  const args: DisasterArgs = {
    checkConfig: false,
    help: false,
    noRecordEvents: false,
  };

  for (const arg of argv) {
    if (arg === "--") continue;
    if (arg === "--help" || arg === "-h") args.help = true;
    else if (arg === "--check-config") args.checkConfig = true;
    else if (arg === "--no-record-events") args.noRecordEvents = true;
    else if (arg.startsWith("--backup-dir=")) {
      args.backupDir = arg.slice("--backup-dir=".length);
    } else {
      throw new Error(`Argumento desconhecido: ${arg}`);
    }
  }

  return args;
}

function loadEnv() {
  for (const envPath of ENV_PATHS) {
    if (fs.existsSync(envPath)) {
      dotenv.config({ path: envPath, override: true, quiet: true });
    }
  }
}

function readEnvString(name: string) {
  const value = process.env[name]?.trim();
  if (!value || value === '""' || value === "''") return "";
  return value;
}

function readPositiveInteger(name: string, fallback: number) {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function parseDatabaseTarget(name: string, value: string): DatabaseTarget {
  if (!value) throw new Error(`${name} nao foi configurado.`);

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${name} invalido.`);
  }

  if (!["mysql:", "mysql2:"].includes(parsed.protocol)) {
    throw new Error(`${name} precisa usar protocolo mysql/mysql2.`);
  }

  const database = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  if (!parsed.hostname || !database || !parsed.username) {
    throw new Error(`${name} precisa conter host, usuario e nome do banco.`);
  }

  return {
    url: value,
    hostname: parsed.hostname.toLowerCase(),
    port: parsed.port || "3306",
    database,
    username: decodeURIComponent(parsed.username),
    label: name,
  };
}

function buildRestoreUrlFromSource(sourceUrl: string, databaseName: string) {
  if (!sourceUrl || !databaseName) return "";

  try {
    const parsed = new URL(sourceUrl);
    parsed.pathname = `/${encodeURIComponent(databaseName)}`;
    return parsed.toString();
  } catch {
    return "";
  }
}

function isLocalDatabase(target: DatabaseTarget) {
  return [
    "mysql",
    "localhost",
    "127.0.0.1",
    "0.0.0.0",
    "::1",
    "host.docker.internal",
  ].includes(target.hostname);
}

function assertSourceSafe(source: DatabaseTarget) {
  if (isLocalDatabase(source) && process.env.DR_ALLOW_LOCAL_SOURCE !== "true") {
    throw new Error(
      "DATABASE_URL aponta para banco local. Use DR_ALLOW_LOCAL_SOURCE=true somente para teste local."
    );
  }
}

function assertRestoreTargetSafe(
  source: DatabaseTarget,
  target: DatabaseTarget
) {
  if (
    source.hostname === target.hostname &&
    source.port === target.port &&
    source.database === target.database
  ) {
    throw new Error(
      "RESTORE_TEST_DATABASE_URL nao pode apontar para o banco de origem."
    );
  }

  const confirmation = readEnvString("DR_RESTORE_CONFIRM_DATABASE");
  if (confirmation !== target.database) {
    throw new Error(
      `DR_RESTORE_CONFIRM_DATABASE deve ser exatamente "${target.database}" para liberar o reset do alvo.`
    );
  }

  if (
    process.env.DR_RESTORE_ALLOW_ANY_TARGET !== "true" &&
    !SAFE_TARGET_DATABASE_PATTERN.test(target.database)
  ) {
    throw new Error(
      "Nome do banco de restore precisa indicar alvo descartavel (restore/drill/backup/test/etc.)."
    );
  }
}

function shouldUseSsl(
  url: string,
  prefix: "DATABASE" | "RESTORE_TEST_DATABASE"
) {
  const explicit = readEnvString(`${prefix}_SSL`);
  if (explicit === "true") return true;
  if (explicit === "false") return false;
  if (prefix === "RESTORE_TEST_DATABASE") {
    const sourceExplicit = readEnvString("DATABASE_SSL");
    if (sourceExplicit === "true") return true;
    if (sourceExplicit === "false") return false;
  }
  return /ssl-mode=required|tidbcloud|aivencloud|planetscale|railway/i.test(
    url
  );
}

function getDatabaseSslCa(prefix: "DATABASE" | "RESTORE_TEST_DATABASE") {
  const ca = readEnvString(`${prefix}_SSL_CA`);
  if (ca) return ca.replace(/\\n/g, "\n");

  const caPath = readEnvString(`${prefix}_SSL_CA_PATH`);
  if (caPath && fs.existsSync(caPath)) return fs.readFileSync(caPath, "utf8");

  if (prefix === "RESTORE_TEST_DATABASE") {
    return getDatabaseSslCa("DATABASE");
  }

  return undefined;
}

function shouldRejectUnauthorized(prefix: "DATABASE" | "RESTORE_TEST_DATABASE") {
  const explicit = readEnvString(`${prefix}_SSL_REJECT_UNAUTHORIZED`);
  if (explicit === "true") return true;
  if (explicit === "false") return false;

  if (prefix === "RESTORE_TEST_DATABASE") {
    const sourceExplicit = readEnvString("DATABASE_SSL_REJECT_UNAUTHORIZED");
    if (sourceExplicit === "true") return true;
    if (sourceExplicit === "false") return false;
  }

  return true;
}

function getMysqlDriverUrl(databaseUrl: string) {
  try {
    const url = new URL(databaseUrl);
    for (const key of Array.from(url.searchParams.keys())) {
      if (key.toLowerCase().startsWith("ssl")) {
        url.searchParams.delete(key);
      }
    }
    return url.toString();
  } catch {
    return databaseUrl;
  }
}

function createPool(
  target: DatabaseTarget,
  prefix: "DATABASE" | "RESTORE_TEST_DATABASE"
) {
  const options: any = {
    uri: getMysqlDriverUrl(target.url),
    waitForConnections: true,
    connectionLimit: readPositiveInteger("DR_DB_CONNECTION_LIMIT", 2),
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
  };

  if (shouldUseSsl(target.url, prefix)) {
    options.ssl = {
      minVersion: "TLSv1.2",
      rejectUnauthorized: shouldRejectUnauthorized(prefix),
      ca: getDatabaseSslCa(prefix),
    };
  }

  return mysql.createPool(options);
}

function quoteIdentifier(value: string) {
  return `\`${value.replace(/`/g, "``")}\``;
}

function safeDatabaseSummary(target: DatabaseTarget) {
  return {
    host: target.hostname,
    port: target.port,
    database: target.database,
    username: target.username,
  };
}

async function listBaseTables(db: Queryable) {
  const [rows] = await db.query<RowDataPacket[]>(
    "SHOW FULL TABLES WHERE Table_type = 'BASE TABLE'"
  );

  return rows
    .map(row => {
      const tableEntry = Object.entries(row).find(([key]) =>
        key.startsWith("Tables_in_")
      );
      return tableEntry ? String(tableEntry[1]) : "";
    })
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
}

async function getPrimaryKeyColumns(db: Queryable, table: string) {
  const [rows] = await db.query<RowDataPacket[]>(
    `SHOW KEYS FROM ${quoteIdentifier(table)} WHERE Key_name = 'PRIMARY'`
  );
  return rows
    .sort((a, b) => Number(a.Seq_in_index ?? 0) - Number(b.Seq_in_index ?? 0))
    .map(row => String(row.Column_name))
    .filter(Boolean);
}

async function getCreateTableSql(db: Queryable, table: string) {
  const [rows] = await db.query<RowDataPacket[]>(
    `SHOW CREATE TABLE ${quoteIdentifier(table)}`
  );
  return String(rows[0]?.["Create Table"] ?? "");
}

async function countRows(db: Queryable, table: string) {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS count FROM ${quoteIdentifier(table)}`
  );
  return Number(rows[0]?.count ?? 0);
}

function normalizeValue(value: unknown): unknown {
  if (value instanceof Date) {
    return { __econorotaType: "date", value: value.toISOString() };
  }
  if (Buffer.isBuffer(value)) {
    return { __econorotaType: "buffer", value: value.toString("base64") };
  }
  if (Array.isArray(value)) return value.map(normalizeValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        normalizeValue(item),
      ])
    );
  }
  return value;
}

function formatMysqlDateTime(value: unknown) {
  const date = new Date(String(value));
  if (!Number.isFinite(date.getTime())) return String(value);

  return date.toISOString().slice(0, 19).replace("T", " ");
}

function restoreValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(restoreValue);
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (record.__econorotaType === "date") return formatMysqlDateTime(record.value);
    if (record.__econorotaType === "buffer") {
      return Buffer.from(String(record.value), "base64");
    }
    return Object.fromEntries(
      Object.entries(record).map(([key, item]) => [key, restoreValue(item)])
    );
  }
  return value;
}

function sqlValue(value: unknown) {
  const restored = restoreValue(value);
  if (restored && typeof restored === "object" && !Buffer.isBuffer(restored)) {
    return JSON.stringify(restored);
  }
  return restored;
}

async function hashFile(filePath: string) {
  const hash = crypto.createHash("sha256");
  const stream = fs.createReadStream(filePath);
  stream.on("data", chunk => hash.update(chunk));
  await once(stream, "end");
  return hash.digest("hex");
}

async function writeJsonLine(stream: zlib.Gzip, value: unknown) {
  if (!stream.write(`${JSON.stringify(value)}\n`)) {
    await once(stream, "drain");
  }
}

async function createBackup(
  pool: Pool,
  backupDir: string
): Promise<BackupSummary> {
  const startedAt = new Date();
  const batchSize = readPositiveInteger(
    "DR_BACKUP_BATCH_SIZE",
    DEFAULT_BATCH_SIZE
  );
  const absoluteDir = path.resolve(backupDir);
  await fs.promises.mkdir(absoluteDir, { recursive: true });

  const stamp = startedAt.toISOString().replace(/[:.]/g, "-");
  const fileName = `econorotas-dr-${stamp}.jsonl.gz`;
  const filePath = path.join(absoluteDir, fileName);
  const gzip = zlib.createGzip({ level: 9 });
  const output = fs.createWriteStream(filePath, { flags: "wx" });
  gzip.pipe(output);

  const tables = await listBaseTables(pool);
  const tableSummaries: Array<{ table: string; rows: number }> = [];
  let totalRows = 0;

  await writeJsonLine(gzip, {
    kind: "manifest",
    version: 1,
    app: "EconoRota",
    startedAt: startedAt.toISOString(),
    batchSize,
    tables,
  });

  for (const table of tables) {
    const createTableSql = await getCreateTableSql(pool, table);
    const rowCount = await countRows(pool, table);
    const primaryKeys = await getPrimaryKeyColumns(pool, table);
    const orderBy = primaryKeys.length
      ? ` ORDER BY ${primaryKeys.map(quoteIdentifier).join(", ")}`
      : "";

    tableSummaries.push({ table, rows: rowCount });
    totalRows += rowCount;

    await writeJsonLine(gzip, {
      kind: "table",
      table,
      createTableSql,
      rowCount,
      primaryKeys,
    });

    for (let offset = 0; offset < rowCount; offset += batchSize) {
      const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT * FROM ${quoteIdentifier(table)}${orderBy} LIMIT ? OFFSET ?`,
        [batchSize, offset]
      );

      await writeJsonLine(gzip, {
        kind: "rows",
        table,
        rows: rows.map(row =>
          Object.fromEntries(
            Object.entries(row).map(([key, value]) => [
              key,
              normalizeValue(value),
            ])
          )
        ),
      });
    }
  }

  const finishedAt = new Date();
  await writeJsonLine(gzip, {
    kind: "complete",
    finishedAt: finishedAt.toISOString(),
    tableCount: tableSummaries.length,
    rowCount: totalRows,
  });
  gzip.end();
  await once(output, "finish");

  const stats = await fs.promises.stat(filePath);
  const sha256 = await hashFile(filePath);

  return {
    filePath,
    fileName,
    sizeBytes: stats.size,
    sha256,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    tableCount: tableSummaries.length,
    rowCount: totalRows,
    tables: tableSummaries,
  };
}

async function resetRestoreTarget(db: PoolConnection) {
  await db.query("SET FOREIGN_KEY_CHECKS = 0");
  const tables = await listBaseTables(db);
  for (const table of tables) {
    await db.query(`DROP TABLE IF EXISTS ${quoteIdentifier(table)}`);
  }
}

async function insertRows(
  db: PoolConnection,
  table: string,
  rows: Array<Record<string, unknown>>
) {
  if (rows.length === 0) return;

  const columns = Object.keys(rows[0] ?? {});
  if (columns.length === 0) return;

  const values = rows.map(row => columns.map(column => sqlValue(row[column])));
  await db.query(
    `INSERT INTO ${quoteIdentifier(table)} (${columns
      .map(quoteIdentifier)
      .join(", ")}) VALUES ?`,
    [values]
  );
}

async function restoreBackup(
  pool: Pool,
  backup: BackupSummary
): Promise<RestoreSummary> {
  const startedAt = new Date();
  const expectedCounts = new Map<string, number>();
  const tableOrder: string[] = [];
  const connection = await pool.getConnection();

  try {
    await resetRestoreTarget(connection);

    const input = fs
      .createReadStream(backup.filePath)
      .pipe(zlib.createGunzip());
    const lines = readline.createInterface({
      input,
      crlfDelay: Infinity,
    });

    for await (const line of lines) {
      if (!line.trim()) continue;
      const record = JSON.parse(line);

      if (record.kind === "table") {
        const table = String(record.table);
        tableOrder.push(table);
        expectedCounts.set(table, Number(record.rowCount ?? 0));
        await connection.query(String(record.createTableSql));
      } else if (record.kind === "rows") {
        await insertRows(connection, String(record.table), record.rows ?? []);
      }
    }

    const restoredTables = await listBaseTables(connection);
    const restored = [];
    let totalRows = 0;

    for (const table of tableOrder) {
      if (!restoredTables.includes(table)) {
        throw new Error(`Tabela ${table} nao foi restaurada no alvo.`);
      }

      const expected = expectedCounts.get(table) ?? 0;
      const restoredRows = await countRows(connection, table);
      if (restoredRows !== expected) {
        throw new Error(
          `Tabela ${table} restaurou ${restoredRows} linhas, esperado ${expected}.`
        );
      }
      totalRows += restoredRows;
      restored.push({ table, sourceRows: expected, restoredRows });
    }

    await connection.query("SET FOREIGN_KEY_CHECKS = 1");
    const finishedAt = new Date();

    return {
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      tableCount: restored.length,
      rowCount: totalRows,
      tables: restored,
    };
  } finally {
    try {
      await connection.query("SET FOREIGN_KEY_CHECKS = 1");
    } finally {
      connection.release();
    }
  }
}

async function recordOperationalEvent(
  pool: Pool,
  input: {
    type:
      | "backup_completed"
      | "backup_failed"
      | "restore_test_passed"
      | "restore_test_failed";
    severity: "info" | "warning" | "error" | "fatal";
    title: string;
    message: string;
    runtime?: string | null;
    metadata: Record<string, unknown>;
  }
) {
  await pool.query(
    `
      INSERT INTO operationalEvents
        (userId, routeId, stopId, type, severity, source, title, message, runtime, metadata, createdAt)
      VALUES
        (NULL, NULL, NULL, ?, ?, 'ops.disasterRecovery.drill', ?, ?, ?, ?, NOW())
    `,
    [
      input.type,
      input.severity,
      input.title,
      input.message,
      input.runtime ?? null,
      JSON.stringify(input.metadata),
    ]
  );
}

function publicBackupMetadata(
  source: DatabaseTarget,
  target: DatabaseTarget,
  backup?: BackupSummary,
  restore?: RestoreSummary
) {
  return {
    source: safeDatabaseSummary(source),
    restoreTarget: safeDatabaseSummary(target),
    backup: backup
      ? {
          fileName: backup.fileName,
          sizeBytes: backup.sizeBytes,
          sha256: backup.sha256,
          tableCount: backup.tableCount,
          rowCount: backup.rowCount,
          startedAt: backup.startedAt,
          finishedAt: backup.finishedAt,
          durationMs: backup.durationMs,
        }
      : null,
    restore: restore
      ? {
          tableCount: restore.tableCount,
          rowCount: restore.rowCount,
          startedAt: restore.startedAt,
          finishedAt: restore.finishedAt,
          durationMs: restore.durationMs,
        }
      : null,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  loadEnv();

  const source = parseDatabaseTarget(
    "DATABASE_URL",
    readEnvString("DATABASE_URL")
  );
  const sourceUrl = readEnvString("DATABASE_URL");
  const restoreUrl =
    readEnvString("RESTORE_TEST_DATABASE_URL") ||
    readEnvString("DR_RESTORE_DATABASE_URL") ||
    buildRestoreUrlFromSource(
      sourceUrl,
      readEnvString("DR_RESTORE_DATABASE_NAME")
    );
  const target = parseDatabaseTarget(
    "RESTORE_TEST_DATABASE_URL",
    restoreUrl
  );
  assertSourceSafe(source);
  assertRestoreTargetSafe(source, target);

  const backupDir =
    args.backupDir || readEnvString("DR_BACKUP_DIR") || DEFAULT_BACKUP_DIR;

  if (args.checkConfig) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          backupDir: path.resolve(backupDir),
          batchSize: readPositiveInteger(
            "DR_BACKUP_BATCH_SIZE",
            DEFAULT_BATCH_SIZE
          ),
          recordEvents: !args.noRecordEvents,
          source: safeDatabaseSummary(source),
          restoreTarget: safeDatabaseSummary(target),
        },
        null,
        2
      )
    );
    return;
  }

  let sourcePool: Pool | null = null;
  let targetPool: Pool | null = null;
  let backup: BackupSummary | undefined;
  let restore: RestoreSummary | undefined;
  let phase: "backup" | "restore" = "backup";
  const runStartedAt = Date.now();

  try {
    sourcePool = createPool(source, "DATABASE");
    targetPool = createPool(target, "RESTORE_TEST_DATABASE");

    await sourcePool.query("SELECT 1");
    await targetPool.query("SELECT 1");

    backup = await createBackup(sourcePool, backupDir);
    phase = "restore";
    restore = await restoreBackup(targetPool, backup);

    if (!args.noRecordEvents) {
      await recordOperationalEvent(sourcePool, {
        type: "backup_completed",
        severity: "info",
        title: "Backup logico concluido",
        message: `Backup DR gerado com ${backup.tableCount} tabelas e ${backup.rowCount} linhas.`,
        runtime: String(backup.durationMs),
        metadata: publicBackupMetadata(source, target, backup, restore),
      });

      await recordOperationalEvent(sourcePool, {
        type: "restore_test_passed",
        severity: "info",
        title: "Restore test aprovado",
        message: `Restore validado em banco descartavel com ${restore.tableCount} tabelas e ${restore.rowCount} linhas.`,
        runtime: String(restore.durationMs),
        metadata: publicBackupMetadata(source, target, backup, restore),
      });
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          recordedEvents: !args.noRecordEvents,
          durationMs: Date.now() - runStartedAt,
          backup: {
            filePath: backup.filePath,
            fileName: backup.fileName,
            sizeBytes: backup.sizeBytes,
            sha256: backup.sha256,
            tableCount: backup.tableCount,
            rowCount: backup.rowCount,
          },
          restore: {
            tableCount: restore.tableCount,
            rowCount: restore.rowCount,
            durationMs: restore.durationMs,
          },
        },
        null,
        2
      )
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (sourcePool && !args.noRecordEvents) {
      try {
        await recordOperationalEvent(sourcePool, {
          type: phase === "backup" ? "backup_failed" : "restore_test_failed",
          severity: phase === "backup" ? "fatal" : "error",
          title:
            phase === "backup" ? "Backup logico falhou" : "Restore test falhou",
          message,
          metadata: {
            phase,
            error: message,
            ...publicBackupMetadata(source, target, backup, restore),
          },
        });
      } catch (eventError) {
        console.warn(
          "[DR] Falha ao registrar evento de erro:",
          eventError instanceof Error ? eventError.message : eventError
        );
      }
    }

    console.error(`[DR] ${message}`);
    process.exitCode = 1;
  } finally {
    await Promise.allSettled([sourcePool?.end(), targetPool?.end()]);
  }
}

main().catch(error => {
  console.error("[DR]", error instanceof Error ? error.message : error);
  process.exit(1);
});
