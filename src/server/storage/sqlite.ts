import Database from "better-sqlite3";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { StepResult } from "../orchestrator/types";
import { StepValidation } from "../validation/visionValidator";

const DATA_DIR = join(process.cwd(), ".data");

export type PersistedRunStatus = "passed" | "failed" | "aborted";
export type PersistedTrustState = "auditable" | "degraded";

export interface PersistedRun {
  id: string;
  name: string;
  scenarioCount: number;
  totalSteps: number;
  startedAt: string;
  completedAt: string;
  status: PersistedRunStatus;
  summary: string;
  totalTokens: number;
  totalCostUsd: number;
  hallucinationCount: number;
  needsReviewCount: number;
  trustState: PersistedTrustState;
  trustReasons: string[];
  provider: string | null;
  orchestratorModel: string | null;
  lowCostAuditorModel: string | null;
  highAccuracyAuditorModel: string | null;
}

export interface PersistedStep {
  id: string;
  runId: string;
  mcpId: string;
  index: number;
  text: string;
  canonicalType: "given" | "when" | "then";
  status: "passed" | "failed" | "aborted";
  message: string;
  tokens: {
    input: number;
    output: number;
    total: number;
  };
  latencyMs: number;
  networkOverheadMs: number;
  toolCalls: unknown[];
  validation: StepValidation | null;
}

export interface PersistedScreenshot {
  id: string;
  runId: string;
  stepId: string;
  toolCallId?: string;
  path: string;
  timestamp: string;
}

export interface RunDetail extends PersistedRun {
  steps: PersistedStep[];
  screenshots: PersistedScreenshot[];
  estimatedCost: number;
}

export interface SaveRunOptions {
  startedAt?: string;
  completedAt?: string;
  totalCostUsd?: number;
  trustState?: PersistedTrustState;
  trustReasons?: string[];
  provider?: string;
  orchestratorModel?: string;
  lowCostAuditorModel?: string;
  highAccuracyAuditorModel?: string;
}

export type PersistableStep = StepResult & {
  mcpId?: string;
  networkOverheadMs?: number;
  toolCalls?: unknown[];
  validation?: StepValidation | null;
};

let dbInstance: Database | null = null;

function initializeDb(): Database {
  if (dbInstance) {
    return dbInstance;
  }

  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }

  const dbPath = join(DATA_DIR, "runs.db");
  const db = new Database(dbPath);

  db.exec(`
    CREATE TABLE IF NOT EXISTS runs (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      scenarioCount INTEGER NOT NULL,
      totalSteps INTEGER NOT NULL,
      startedAt TEXT NOT NULL,
      completedAt TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('passed', 'failed', 'aborted')),
      summary TEXT NOT NULL,
      totalTokens INTEGER NOT NULL DEFAULT 0,
      totalCostUsd REAL NOT NULL DEFAULT 0,
      hallucinationCount INTEGER NOT NULL DEFAULT 0,
      needsReviewCount INTEGER NOT NULL DEFAULT 0,
      trustState TEXT NOT NULL DEFAULT 'auditable',
      trustReasons TEXT NOT NULL DEFAULT '[]',
      provider TEXT,
      orchestratorModel TEXT,
      lowCostAuditorModel TEXT,
      highAccuracyAuditorModel TEXT
    );

    CREATE TABLE IF NOT EXISTS steps (
      id TEXT PRIMARY KEY,
      runId TEXT NOT NULL,
      mcpId TEXT NOT NULL DEFAULT 'unknown',
      "index" INTEGER NOT NULL,
      text TEXT NOT NULL,
      canonicalType TEXT NOT NULL CHECK(canonicalType IN ('given', 'when', 'then')),
      status TEXT NOT NULL CHECK(status IN ('passed', 'failed', 'aborted')),
      message TEXT NOT NULL,
      tokens TEXT NOT NULL,
      latencyMs INTEGER NOT NULL,
      networkOverheadMs INTEGER NOT NULL DEFAULT 0,
      toolCalls TEXT NOT NULL DEFAULT '[]',
      validation TEXT,
      FOREIGN KEY (runId) REFERENCES runs(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS screenshots (
      id TEXT PRIMARY KEY,
      runId TEXT NOT NULL,
      stepId TEXT NOT NULL,
      toolCallId TEXT,
      path TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      FOREIGN KEY (runId) REFERENCES runs(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS runs_startedAt ON runs(startedAt DESC);
    CREATE INDEX IF NOT EXISTS steps_runId ON steps(runId, "index");
    CREATE INDEX IF NOT EXISTS screenshots_stepId ON screenshots(stepId);
  `);

  ensureColumn(db, "runs", "totalTokens", "ALTER TABLE runs ADD COLUMN totalTokens INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "runs", "totalCostUsd", "ALTER TABLE runs ADD COLUMN totalCostUsd REAL NOT NULL DEFAULT 0");
  ensureColumn(db, "runs", "hallucinationCount", "ALTER TABLE runs ADD COLUMN hallucinationCount INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "runs", "needsReviewCount", "ALTER TABLE runs ADD COLUMN needsReviewCount INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "runs", "trustState", "ALTER TABLE runs ADD COLUMN trustState TEXT NOT NULL DEFAULT 'auditable'");
  ensureColumn(db, "runs", "trustReasons", "ALTER TABLE runs ADD COLUMN trustReasons TEXT NOT NULL DEFAULT '[]'");
  ensureColumn(db, "runs", "provider", "ALTER TABLE runs ADD COLUMN provider TEXT");
  ensureColumn(db, "runs", "orchestratorModel", "ALTER TABLE runs ADD COLUMN orchestratorModel TEXT");
  ensureColumn(db, "runs", "lowCostAuditorModel", "ALTER TABLE runs ADD COLUMN lowCostAuditorModel TEXT");
  ensureColumn(db, "runs", "highAccuracyAuditorModel", "ALTER TABLE runs ADD COLUMN highAccuracyAuditorModel TEXT");

  ensureColumn(db, "steps", "mcpId", "ALTER TABLE steps ADD COLUMN mcpId TEXT NOT NULL DEFAULT 'unknown'");
  ensureColumn(db, "steps", "networkOverheadMs", "ALTER TABLE steps ADD COLUMN networkOverheadMs INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "steps", "toolCalls", "ALTER TABLE steps ADD COLUMN toolCalls TEXT NOT NULL DEFAULT '[]'");
  ensureColumn(db, "steps", "validation", "ALTER TABLE steps ADD COLUMN validation TEXT");

  db.exec("CREATE INDEX IF NOT EXISTS steps_mcpId ON steps(mcpId)");

  dbInstance = db;
  return db;
}

function ensureColumn(db: Database, table: string, column: string, alterSql: string): void {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  const exists = cols.some((c) => c.name === column);
  if (!exists) {
    db.exec(alterSql);
  }
}

export function getDb(): Database {
  return initializeDb();
}

export function saveRun(
  runId: string,
  name: string,
  scenarioCount: number,
  steps: PersistableStep[],
  status: PersistedRunStatus,
  options: SaveRunOptions = {}
): string {
  const db = getDb();

  const completedAt = options.completedAt ?? new Date().toISOString();
  const startedAt = options.startedAt ?? new Date(Date.now() - 60000).toISOString();

  const failedCount = steps.filter((s) => s.status === "failed").length;
  const passedCount = steps.filter((s) => s.status === "passed").length;
  const summary = `${passedCount} pasados, ${failedCount} fallidos de ${steps.length} pasos`;

  const totalTokens = steps.reduce((acc, step) => acc + (step.tokens?.total ?? 0), 0);
  const totalCostUsd =
    options.totalCostUsd ??
    Number((totalTokens * 0.000005).toFixed(6));
  const hallucinationCount = steps.filter((s) => s.validation?.hallucinated).length;
  const needsReviewCount = steps.filter((s) => s.validation?.needsReview).length;
  const trustState = options.trustState ?? "auditable";
  const trustReasons = options.trustReasons ?? [];

  const insertRun = db.prepare(`
    INSERT OR REPLACE INTO runs (
      id, name, scenarioCount, totalSteps, startedAt, completedAt, status, summary,
      totalTokens, totalCostUsd, hallucinationCount, needsReviewCount,
      trustState, trustReasons, provider, orchestratorModel, lowCostAuditorModel, highAccuracyAuditorModel
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const deleteSteps = db.prepare("DELETE FROM steps WHERE runId = ?");
  const insertStep = db.prepare(`
    INSERT INTO steps (
      id, runId, mcpId, "index", text, canonicalType, status, message,
      tokens, latencyMs, networkOverheadMs, toolCalls, validation
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const transaction = db.transaction(() => {
    insertRun.run(
      runId,
      name,
      scenarioCount,
      steps.length,
      startedAt,
      completedAt,
      status,
      summary,
      totalTokens,
      totalCostUsd,
      hallucinationCount,
      needsReviewCount,
      trustState,
      JSON.stringify(trustReasons),
      options.provider ?? null,
      options.orchestratorModel ?? null,
      options.lowCostAuditorModel ?? null,
      options.highAccuracyAuditorModel ?? null
    );

    deleteSteps.run(runId);

    for (const step of steps) {
      const persistedStepId = `${runId}:${step.stepId}:${step.stepIndex}`;
      insertStep.run(
        persistedStepId,
        runId,
        step.mcpId ?? "unknown",
        step.stepIndex,
        step.stepText,
        step.canonicalType,
        step.status,
        step.message,
        JSON.stringify(step.tokens),
        step.latencyMs,
        step.networkOverheadMs ?? 0,
        JSON.stringify(step.toolCalls ?? []),
        step.validation ? JSON.stringify(step.validation) : null
      );
    }
  });

  transaction();
  return runId;
}

export function listRuns(limit: number = 10, offset: number = 0): PersistedRun[] {
  const db = getDb();

  const stmt = db.prepare(`
    SELECT * FROM runs
    ORDER BY startedAt DESC
    LIMIT ? OFFSET ?
  `);

  const rows = stmt.all(limit, offset) as Array<Record<string, unknown>>;

  return rows.map((row) => toPersistedRun(row));
}

export function listRunsByDateRange(from?: string, to?: string): PersistedRun[] {
  const db = getDb();
  const where: string[] = [];
  const params: unknown[] = [];

  if (from) {
    where.push("startedAt >= ?");
    params.push(from);
  }
  if (to) {
    where.push("startedAt <= ?");
    params.push(to);
  }

  const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
  const stmt = db.prepare(`SELECT * FROM runs ${whereSql} ORDER BY startedAt DESC`);
  const rows = stmt.all(...params) as Array<Record<string, unknown>>;
  return rows.map((row) => toPersistedRun(row));
}

export function getRun(runId: string): RunDetail | null {
  const db = getDb();

  const runStmt = db.prepare("SELECT * FROM runs WHERE id = ?");
  const run = runStmt.get(runId) as Record<string, unknown> | undefined;

  if (!run) {
    return null;
  }

  const stepsStmt = db.prepare(`
    SELECT * FROM steps WHERE runId = ? ORDER BY "index"
  `);
  const stepRows = stepsStmt.all(runId) as Array<Record<string, unknown>>;

  const screenshotsStmt = db.prepare(`
    SELECT * FROM screenshots WHERE runId = ? ORDER BY timestamp ASC
  `);
  const screenshotRows = screenshotsStmt.all(runId) as Array<Record<string, unknown>>;

  const steps: PersistedStep[] = stepRows.map((row) => ({
    id: String(row.id),
    runId: String(row.runId),
    mcpId: String(row.mcpId ?? "unknown"),
    index: Number(row.index),
    text: String(row.text),
    canonicalType: String(row.canonicalType) as PersistedStep["canonicalType"],
    status: String(row.status) as PersistedStep["status"],
    message: String(row.message),
    tokens: safeJsonParse(String(row.tokens), { input: 0, output: 0, total: 0 }),
    latencyMs: Number(row.latencyMs),
    networkOverheadMs: Number(row.networkOverheadMs ?? 0),
    toolCalls: safeJsonParse(String(row.toolCalls ?? "[]"), []),
    validation: row.validation ? safeJsonParse(String(row.validation), null) : null,
  }));

  const screenshots: PersistedScreenshot[] = screenshotRows.map((row) => ({
    id: String(row.id),
    runId: String(row.runId),
    stepId: String(row.stepId),
    toolCallId: row.toolCallId ? String(row.toolCallId) : undefined,
    path: String(row.path),
    timestamp: String(row.timestamp),
  }));

  const base = toPersistedRun(run);

  return {
    ...base,
    steps,
    screenshots,
    estimatedCost: base.totalCostUsd,
  };
}

export function saveScreenshot(
  screenshotId: string,
  runId: string,
  stepId: string,
  path: string,
  toolCallId?: string
): void {
  const db = getDb();

  const resolvedRow = db
    .prepare(
      `SELECT id FROM steps
       WHERE runId = ? AND (id = ? OR id LIKE ?)
       ORDER BY "index" ASC
       LIMIT 1`
    )
    .get(runId, stepId, `${runId}:${stepId}:%`) as { id?: string } | undefined;

  const resolvedStepId = resolvedRow?.id ?? stepId;

  const stmt = db.prepare(`
    INSERT OR REPLACE INTO screenshots (id, runId, stepId, toolCallId, path, timestamp)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  stmt.run(screenshotId, runId, resolvedStepId, toolCallId ?? null, path, new Date().toISOString());
}

/** Ruta en disco guardada al persistir el run (fallback si getScreenshot no encuentra el fichero). */
export function getPersistedScreenshotPathById(screenshotId: string): string | null {
  const db = getDb();
  const row = db
    .prepare("SELECT path FROM screenshots WHERE id = ?")
    .get(screenshotId) as { path?: string } | undefined;
  return row?.path ? String(row.path) : null;
}

export function getLatestRunId(): string | null {
  const db = getDb();
  const row = db.prepare("SELECT id FROM runs ORDER BY startedAt DESC LIMIT 1").get() as { id?: string } | undefined;
  return row?.id ?? null;
}

export function getTotalCostUsd(): number {
  const db = getDb();
  const row = db
    .prepare("SELECT COALESCE(SUM(totalCostUsd), 0) AS total FROM runs")
    .get() as { total?: number };
  return Number(row.total ?? 0);
}

export function closeDb(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

function toPersistedRun(row: Record<string, unknown>): PersistedRun {
  return {
    id: String(row.id),
    name: String(row.name),
    scenarioCount: Number(row.scenarioCount),
    totalSteps: Number(row.totalSteps),
    startedAt: String(row.startedAt),
    completedAt: String(row.completedAt),
    status: String(row.status) as PersistedRunStatus,
    summary: String(row.summary),
    totalTokens: Number(row.totalTokens ?? 0),
    totalCostUsd: Number(row.totalCostUsd ?? 0),
    hallucinationCount: Number(row.hallucinationCount ?? 0),
    needsReviewCount: Number(row.needsReviewCount ?? 0),
    trustState: String(row.trustState ?? "auditable") as PersistedTrustState,
    trustReasons: safeJsonParse(String(row.trustReasons ?? "[]"), []),
    provider: row.provider ? String(row.provider) : null,
    orchestratorModel: row.orchestratorModel ? String(row.orchestratorModel) : null,
    lowCostAuditorModel: row.lowCostAuditorModel ? String(row.lowCostAuditorModel) : null,
    highAccuracyAuditorModel: row.highAccuracyAuditorModel ? String(row.highAccuracyAuditorModel) : null,
  };
}

function safeJsonParse<T>(input: string, fallback: T): T {
  try {
    return JSON.parse(input) as T;
  } catch {
    return fallback;
  }
}
