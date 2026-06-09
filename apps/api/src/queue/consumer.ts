import type { Env } from "../env";
import { processExportMessage } from "../modules/reports/reports.service";
import type { ExportJobMessage } from "./types";

/**
 * Cloudflare Queues consumer for report exports (see docs/architecter.md
 * "Reporting Flow"). Each message generates one export off the request path.
 * A transient failure under the attempt cap is `retry()`-ed (the queue redelivers
 * with backoff); a permanent failure is recorded on the job row and `ack()`-ed so
 * the message isn't retried forever.
 */
export async function handleExportQueue(
  batch: MessageBatch<ExportJobMessage>,
  env: Env["Bindings"],
): Promise<void> {
  for (const message of batch.messages) {
    const outcome = await processExportMessage(env, message.body.jobId, { allowRetry: true });
    if (outcome === "retry") message.retry();
    else message.ack();
  }
}
