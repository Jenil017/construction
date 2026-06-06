import { apiSuccessSchema } from "@construction-erp/shared";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import type { Env } from "../../env";

const healthDataSchema = z
  .object({
    status: z.literal("ok"),
    service: z.string(),
    environment: z.string(),
    timestamp: z.string(),
  })
  .openapi("HealthData");

const healthRoute = createRoute({
  method: "get",
  path: "/health",
  tags: ["System"],
  summary: "Health check",
  description: "Liveness probe. Returns service status without touching the database.",
  responses: {
    200: {
      description: "Service is healthy",
      content: { "application/json": { schema: apiSuccessSchema(healthDataSchema) } },
    },
  },
});

export const healthRoutes = new OpenAPIHono<Env>();

healthRoutes.openapi(healthRoute, (c) =>
  c.json(
    {
      success: true as const,
      data: {
        status: "ok" as const,
        service: "construction-erp-api",
        environment: c.env.ENVIRONMENT ?? "development",
        timestamp: new Date().toISOString(),
      },
    },
    200,
  ),
);
