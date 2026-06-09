/**
 * Payload pushed onto the export queue by the reports module producer and read
 * by the queue consumer (see docs/architecter.md "Reporting Flow"). Kept in its
 * own dependency-free file so `env.ts` can type the `EXPORT_QUEUE` binding
 * without importing the reports module (avoids an import cycle).
 */
export interface ExportJobMessage {
  jobId: string;
  siteId: string;
}
