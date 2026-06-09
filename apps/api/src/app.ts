import { swaggerUI } from "@hono/swagger-ui";
import { OpenAPIHono } from "@hono/zod-openapi";
import { cors } from "hono/cors";
import { requestId } from "hono/request-id";
import { ValidationError } from "./common/errors";
import { notFound, onError } from "./common/middleware/error-handler";
import { loggerMiddleware } from "./common/middleware/logger";
import type { Env } from "./env";
import { attendanceRoutes } from "./modules/attendance";
import { authRoutes } from "./modules/auth";
import { dprRoutes } from "./modules/dpr";
import { healthRoutes } from "./modules/health";
import { inventoryRoutes } from "./modules/inventory";
import { salaryRoutes } from "./modules/salary";
import { siteRoutes } from "./modules/sites";
import { userRoutes } from "./modules/users";

export function createApp() {
  const app = new OpenAPIHono<Env>({
    // Turn schema validation failures into the standard VALIDATION_ERROR shape.
    defaultHook: (result) => {
      if (!result.success) {
        const fields: Record<string, string> = {};
        for (const issue of result.error.issues) {
          const path = issue.path.join(".") || "_";
          if (!fields[path]) fields[path] = issue.message;
        }
        throw new ValidationError("Please check the submitted data.", { fields });
      }
    },
  });

  // Cross-cutting middleware (order matters: request id -> logger -> cors).
  app.use("*", requestId());
  app.use("*", loggerMiddleware);
  app.use(
    "*",
    cors({
      origin: (origin, c) => c.env.FRONTEND_URL ?? "http://localhost:3000",
      credentials: true,
    }),
  );

  // Feature modules.
  app.route("/", healthRoutes);
  app.route("/", authRoutes);
  app.route("/", siteRoutes);
  app.route("/", userRoutes);
  app.route("/", dprRoutes);
  app.route("/", inventoryRoutes);
  app.route("/", attendanceRoutes);
  app.route("/", salaryRoutes);

  // Bearer auth scheme so protected endpoints are marked + testable in Swagger.
  app.openAPIRegistry.registerComponent("securitySchemes", "bearerAuth", {
    type: "http",
    scheme: "bearer",
    bearerFormat: "JWT",
  });

  // OpenAPI document + Swagger UI (see docs/backend_guideline.md "Swagger UI").
  app.doc("/openapi.json", {
    openapi: "3.0.0",
    info: {
      title: "Construction ERP API",
      version: "0.1.0",
      description:
        "Multi-tenant construction ERP backend. All responses use the standard envelope.",
    },
    security: [{ bearerAuth: [] }],
  });
  app.get("/docs", swaggerUI({ url: "/openapi.json" }));

  app.notFound(notFound);
  app.onError(onError);

  return app;
}
