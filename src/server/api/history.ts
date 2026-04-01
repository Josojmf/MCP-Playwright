import { getRun, listRuns } from "../storage/sqlite";
import { getScreenshot } from "../storage/screenshots";

export async function registerHistoryRoutes(server: any) {
  server.get("/api/history", async (request: any, reply: any) => {
    try {
      const limitRaw = Number.parseInt(String(request.query?.limit ?? "10"), 10);
      const offsetRaw = Number.parseInt(String(request.query?.offset ?? "0"), 10);
      const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 100) : 10;
      const offset = Number.isFinite(offsetRaw) ? Math.max(offsetRaw, 0) : 0;

      const runs = listRuns(limit, offset);

      return reply.send({
        status: "success",
        data: runs,
        pagination: {
          limit,
          offset,
          hasMore: runs.length === limit,
        },
      });
    } catch (error) {
      server.log.error(error);
      return reply.code(500).send({
        status: "error",
        message: "Error al obtener el historial de ejecuciones",
      });
    }
  });

  server.get("/api/history/:id", async (request: any, reply: any) => {
    try {
      const { id } = request.params as { id: string };
      const run = getRun(id);

      if (!run) {
        return reply.code(404).send({
          status: "error",
          message: `Ejecución ${id} no encontrada`,
        });
      }

      const failureStats = {
        totalFailed: run.steps.filter((s) => s.status === "failed").length,
        totalPassed: run.steps.filter((s) => s.status === "passed").length,
        totalAborted: run.steps.filter((s) => s.status === "aborted").length,
      };

      return reply.send({
        status: "success",
        data: {
          ...run,
          metadata: {
            totalTokens: run.totalTokens,
            estimatedCost: run.estimatedCost.toFixed(4),
            failureStats,
            executionTime: calculateExecutionTime(run.startedAt, run.completedAt),
          },
        },
      });
    } catch (error) {
      server.log.error(error);
      return reply.code(500).send({
        status: "error",
        message: "Error al obtener los detalles de la ejecución",
      });
    }
  });

  server.get("/api/history/:id/export.json", async (request: any, reply: any) => {
    try {
      const { id } = request.params as { id: string };
      const run = getRun(id);

      if (!run) {
        return reply.code(404).send({
          status: "error",
          message: `Ejecución ${id} no encontrada`,
        });
      }

      reply.header("Content-Type", "application/json; charset=utf-8");
      reply.header("Content-Disposition", `attachment; filename="run-${sanitizeFileName(run.id)}.json"`);
      return reply.send(run);
    } catch (error) {
      server.log.error(error);
      return reply.code(500).send({
        status: "error",
        message: "Error al exportar JSON del run",
      });
    }
  });

  server.get("/api/history/:id/export.csv", async (request: any, reply: any) => {
    try {
      const { id } = request.params as { id: string };
      const run = getRun(id);

      if (!run) {
        return reply.code(404).send({
          status: "error",
          message: `Ejecución ${id} no encontrada`,
        });
      }

      reply.header("Content-Type", "text/csv; charset=utf-8");
      reply.header("Content-Disposition", `attachment; filename="run-${sanitizeFileName(run.id)}.csv"`);
      return reply.send(buildRunCsv(run));
    } catch (error) {
      server.log.error(error);
      return reply.code(500).send({
        status: "error",
        message: "Error al exportar CSV del run",
      });
    }
  });

  server.get("/api/history/export.csv", async (request: any, reply: any) => {
    try {
      const fromMs = request.query?.from ? new Date(String(request.query.from)).getTime() : Number.NEGATIVE_INFINITY;
      const toMs = request.query?.to ? new Date(String(request.query.to)).getTime() : Number.POSITIVE_INFINITY;

      const runs = listRuns(1000, 0).filter((run) => {
        const startedAtMs = new Date(run.startedAt).getTime();
        return startedAtMs >= fromMs && startedAtMs <= toMs;
      });

      const details = runs
        .map((run) => getRun(run.id))
        .filter((run): run is NonNullable<ReturnType<typeof getRun>> => Boolean(run));

      reply.header("Content-Type", "text/csv; charset=utf-8");
      reply.header("Content-Disposition", "attachment; filename=\"runs-summary.csv\"");
      return reply.send(buildSummaryCsv(details));
    } catch (error) {
      server.log.error(error);
      return reply.code(500).send({
        status: "error",
        message: "Error al exportar historial en CSV",
      });
    }
  });

  server.get("/api/history/cost/total", async (_request: any, reply: any) => {
    try {
      const runs = listRuns(1000, 0);
      const totalUsd = runs.reduce((sum, run) => {
        const detail = getRun(run.id);
        return sum + (detail?.estimatedCost ?? 0);
      }, 0);

      return reply.send({
        status: "success",
        data: {
          totalUsd: Number(totalUsd.toFixed(6)),
          runCount: runs.length,
        },
      });
    } catch (error) {
      server.log.error(error);
      return reply.code(500).send({
        status: "error",
        message: "Error al calcular costo acumulado",
      });
    }
  });

  server.get("/api/screenshots/:id", async (request: any, reply: any) => {
    try {
      const screenshotId = String(request.params?.id ?? "");
      if (!screenshotId) {
        return reply.code(400).send({ status: "error", message: "screenshotId requerido" });
      }

      const buffer = await getScreenshot(screenshotId, process.env.DATA_DIR ?? ".data");
      if (!buffer) {
        return reply.code(404).send({ status: "error", message: "Screenshot no encontrado" });
      }

      reply.header("Content-Type", "image/png");
      reply.header("Cache-Control", "public, max-age=60");
      return reply.send(buffer);
    } catch (error) {
      server.log.error(error);
      return reply.code(500).send({ status: "error", message: "Error al recuperar screenshot" });
    }
  });
}

function calculateExecutionTime(startedAt: string, completedAt: string): string {
  const start = new Date(startedAt);
  const end = new Date(completedAt);
  const diffMs = end.getTime() - start.getTime();

  const seconds = Math.floor((diffMs / 1000) % 60);
  const minutes = Math.floor((diffMs / (1000 * 60)) % 60);
  const hours = Math.floor(diffMs / (1000 * 60 * 60));

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

function sanitizeFileName(value: string): string {
  return value.replace(/[^a-zA-Z0-9-_]/g, "_");
}

function csvValue(value: string | number): string {
  if (typeof value === "number") {
    return String(value);
  }

  if (value.includes(",") || value.includes("\"") || value.includes("\n")) {
    return `"${value.replace(/"/g, "\"\"")}"`;
  }

  return value;
}

function buildRunCsv(run: NonNullable<ReturnType<typeof getRun>>): string {
  const header = [
    "runId",
    "stepIndex",
    "canonicalType",
    "status",
    "text",
    "message",
    "latencyMs",
    "inputTokens",
    "outputTokens",
    "totalTokens",
  ];

  const rows = run.steps.map((step) => [
    run.id,
    step.index + 1,
    step.canonicalType,
    step.status,
    step.text,
    step.message,
    step.latencyMs,
    step.tokens.input,
    step.tokens.output,
    step.tokens.total,
  ]);

  return [header, ...rows].map((row) => row.map((value) => csvValue(value)).join(",")).join("\n");
}

function buildSummaryCsv(runs: Array<NonNullable<ReturnType<typeof getRun>>>): string {
  const header = [
    "runId",
    "mcpId",
    "passRate",
    "hallucinationCount",
    "totalTokens",
    "totalCostUsd",
  ];

  const rows: Array<Array<string | number>> = [];

  for (const run of runs) {
    const stepsByMcp = run.steps.reduce<Record<string, typeof run.steps>>((acc, step) => {
      const key = step.mcpId || "unknown";
      if (!acc[key]) {
        acc[key] = [];
      }
      acc[key].push(step);
      return acc;
    }, {});

    for (const [mcpId, mcpSteps] of Object.entries(stepsByMcp)) {
      const totalSteps = mcpSteps.length;
      const passedSteps = mcpSteps.filter((step) => step.status === "passed").length;
      const passRate = totalSteps > 0 ? passedSteps / totalSteps : 0;
      const hallucinationCount = mcpSteps.filter((step) => step.validation?.hallucinated === true).length;
      const totalTokens = mcpSteps.reduce((sum, step) => sum + (step.tokens?.total ?? 0), 0);
      const runTokens = run.totalTokens;
      const totalCostUsd = runTokens > 0 ? (run.totalCostUsd * totalTokens) / runTokens : 0;

      rows.push([
        run.id,
        mcpId,
        Number(passRate.toFixed(2)),
        hallucinationCount,
        totalTokens,
        Number(totalCostUsd.toFixed(4)),
      ]);
    }
  }

  return [header, ...rows].map((row) => row.map((value) => csvValue(value)).join(",")).join("\n");
}
