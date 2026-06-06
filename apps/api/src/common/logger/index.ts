import pino from "pino";

export type Logger = pino.Logger;

/**
 * Structured logger (Pino). In Cloudflare Workers we write through a custom
 * destination that forwards to console.log (captured by Workers/observability),
 * avoiding Pino's Node-only stream transports.
 *
 * Sensitive fields are redacted (see docs/backend_guideline.md "Logging" — never
 * log passwords, tokens, or sensitive salary/payment data).
 */
export function createLogger(options: { level?: string; env?: string }): Logger {
  return pino(
    {
      level: options.level ?? "info",
      base: { service: "construction-erp-api", env: options.env ?? "development" },
      timestamp: pino.stdTimeFunctions.isoTime,
      redact: {
        paths: [
          "password",
          "*.password",
          "token",
          "*.token",
          "accessToken",
          "*.accessToken",
          "refreshToken",
          "*.refreshToken",
          "authorization",
          "*.authorization",
          "req.headers.authorization",
          "req.headers.cookie",
        ],
        remove: true,
      },
    },
    {
      write: (msg: string) => {
        console.log(msg.trimEnd());
      },
    },
  );
}
