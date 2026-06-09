import { type Database, createDb } from "@construction-erp/db";
import { type ExportJob, exportJobs, sites } from "@construction-erp/db/schema";
import { eq } from "drizzle-orm";
import { ExportError } from "../../common/errors";
import { putObject, r2ConfigFromEnv } from "../../common/r2";
import type { Env } from "../../env";
import { DATASET_BUILDERS } from "./reports.datasets";
import { renderDataset } from "./reports.render";
import type { ExportFormat, ExportParams } from "./reports.schemas";

/** Max processing attempts before a job is marked permanently failed. */
export const MAX_EXPORT_ATTEMPTS = 3;

export function exportObjectKey(siteId: string, jobId: string, ext: string): string {
  return `exports/${siteId}/${jobId}.${ext}`;
}

/** Build the dataset, render it, store it in R2, and mark the job completed. */
async function generate(db: Database, env: Env["Bindings"], job: ExportJob): Promise<void> {
  const builder = DATASET_BUILDERS[job.reportType];
  if (!builder) throw new ExportError("This report type is no longer available.");

  const [site] = await db
    .select({ name: sites.name })
    .from(sites)
    .where(eq(sites.id, job.siteId))
    .limit(1);

  const params = (job.params ?? {}) as ExportParams;
  const dataset = await builder({
    db,
    siteId: job.siteId,
    siteName: site?.name ?? "Site",
    params,
  });
  const file = await renderDataset(dataset, job.format as ExportFormat);

  const cfg = r2ConfigFromEnv(env);
  if (!cfg) throw new ExportError("File storage isn't configured yet. Please contact your admin.");
  const key = exportObjectKey(job.siteId, job.id, file.ext);
  await putObject(cfg, key, file.bytes, file.contentType);

  await db
    .update(exportJobs)
    .set({
      status: "completed",
      objectKey: key,
      fileSize: file.bytes.byteLength,
      rowCount: dataset.rows.length,
      completedAt: new Date(),
      errorMessage: null,
    })
    .where(eq(exportJobs.id, job.id));
}

/**
 * Run a single export job to completion. Marks it `processing` (and bumps the
 * attempt counter) before generating; throws on failure so the caller can decide
 * whether to retry. No-ops for an already-completed or deleted job (idempotent).
 */
export async function runExportJob(env: Env["Bindings"], jobId: string): Promise<void> {
  const db = createDb(env.DATABASE_URL);
  const [job] = await db.select().from(exportJobs).where(eq(exportJobs.id, jobId)).limit(1);
  if (!job || job.deletedAt) return;
  if (job.status === "completed") return;

  await db
    .update(exportJobs)
    .set({ status: "processing", attempts: job.attempts + 1 })
    .where(eq(exportJobs.id, jobId));

  await generate(db, env, job);
}

export type MessageOutcome = "ack" | "retry";

/**
 * Process one queued export and record its outcome on the row. Returns `retry`
 * when the queue should redeliver (transient failure under the attempt cap) or
 * `ack` when it's done — completed, or failed and recorded. Never throws, so a
 * background consumer / `waitUntil` caller stays clean.
 */
export async function processExportMessage(
  env: Env["Bindings"],
  jobId: string,
  opts: { allowRetry: boolean },
): Promise<MessageOutcome> {
  try {
    await runExportJob(env, jobId);
    return "ack";
  } catch (err) {
    const message =
      err instanceof ExportError
        ? err.message
        : "The report could not be generated. Please try again.";
    const db = createDb(env.DATABASE_URL);
    const [job] = await db
      .select({ attempts: exportJobs.attempts })
      .from(exportJobs)
      .where(eq(exportJobs.id, jobId))
      .limit(1);
    const attempts = job?.attempts ?? MAX_EXPORT_ATTEMPTS;
    const willRetry = opts.allowRetry && attempts < MAX_EXPORT_ATTEMPTS;
    await db
      .update(exportJobs)
      .set({ status: willRetry ? "queued" : "failed", errorMessage: message })
      .where(eq(exportJobs.id, jobId));
    return willRetry ? "retry" : "ack";
  }
}
