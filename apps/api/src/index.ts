import { createApp } from "./app";
import type { Env } from "./env";
import { handleExportQueue } from "./queue/consumer";
import type { ExportJobMessage } from "./queue/types";

const app = createApp();

/**
 * Worker entry. Exposes the HTTP app (`fetch`) and the Cloudflare Queues consumer
 * (`queue`) for background report generation. The producer lives in the reports
 * module; when no queue binding is present it falls back to in-isolate processing.
 */
export default {
  fetch: app.fetch,
  async queue(batch: MessageBatch<ExportJobMessage>, env: Env["Bindings"]): Promise<void> {
    await handleExportQueue(batch, env);
  },
} satisfies ExportedHandler<Env["Bindings"], ExportJobMessage>;
