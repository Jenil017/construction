import { paginationQuerySchema } from "@construction-erp/shared";
import { z } from "@hono/zod-openapi";

export const DPR_STATUSES = ["draft", "submitted", "approved"] as const;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Images only, up to 10 MB (mobile camera photos). */
export const ALLOWED_PHOTO_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
] as const;
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

export const dprIdParamSchema = z.object({
  id: z
    .string()
    .uuid()
    .openapi({ param: { name: "id", in: "path" } }),
});

export const dprPhotoParamSchema = z.object({
  id: z
    .string()
    .uuid()
    .openapi({ param: { name: "id", in: "path" } }),
  photoId: z
    .string()
    .uuid()
    .openapi({ param: { name: "photoId", in: "path" } }),
});

const personSchema = z.object({ id: z.string().uuid(), name: z.string() });

export const dprPhotoSchema = z
  .object({
    id: z.string().uuid(),
    fileName: z.string().nullable(),
    contentType: z.string().nullable(),
    sizeBytes: z.number().int().nullable(),
    /** Short-lived presigned GET URL, or null when storage isn't configured. */
    url: z.string().nullable(),
    createdAt: z.string(),
  })
  .openapi("DprPhoto");

export const dprSchema = z
  .object({
    id: z.string().uuid(),
    siteId: z.string().uuid(),
    reportDate: z.string(),
    workCategory: z.string().nullable(),
    location: z.string().nullable(),
    completedWork: z.string().nullable(),
    pendingWork: z.string().nullable(),
    quantityValue: z.number().nullable(),
    quantityUnit: z.string().nullable(),
    remarks: z.string().nullable(),
    status: z.string(),
    createdBy: personSchema.nullable(),
    approvedBy: personSchema.nullable(),
    approvedAt: z.string().nullable(),
    photoCount: z.number().int(),
    photos: z.array(dprPhotoSchema),
    createdAt: z.string(),
  })
  .openapi("Dpr");

export const listDprQuerySchema = paginationQuerySchema.extend({
  search: z.string().optional().openapi({ description: "Match work category or location." }),
  status: z.enum(DPR_STATUSES).optional(),
  date: z
    .string()
    .regex(DATE_RE)
    .optional()
    .openapi({ description: "Exact report date (YYYY-MM-DD)." }),
});

const baseDprFields = {
  workCategory: z.string().max(120).nullable().optional(),
  location: z.string().max(200).nullable().optional(),
  completedWork: z.string().max(5000).nullable().optional(),
  pendingWork: z.string().max(5000).nullable().optional(),
  quantityValue: z.number().nonnegative().nullable().optional(),
  quantityUnit: z.string().max(40).nullable().optional(),
  remarks: z.string().max(5000).nullable().optional(),
};

export const createDprBodySchema = z
  .object({
    reportDate: z.string().regex(DATE_RE),
    ...baseDprFields,
    // Approval is a separate action; creation can only draft or submit.
    status: z.enum(["draft", "submitted"]).optional(),
  })
  .openapi("CreateDprRequest");

export const updateDprBodySchema = z
  .object({
    reportDate: z.string().regex(DATE_RE).optional(),
    ...baseDprFields,
    status: z.enum(["draft", "submitted"]).optional(),
  })
  .openapi("UpdateDprRequest");

export const dprUploadUrlBodySchema = z
  .object({
    fileName: z.string().min(1).max(255),
    contentType: z.enum(ALLOWED_PHOTO_TYPES),
    sizeBytes: z.number().int().positive().max(MAX_PHOTO_BYTES),
  })
  .openapi("DprUploadUrlRequest");

export const dprUploadUrlResultSchema = z
  .object({
    uploadUrl: z.string(),
    objectKey: z.string(),
    expiresIn: z.number().int(),
  })
  .openapi("DprUploadUrlResult");

export const confirmDprPhotoBodySchema = z
  .object({
    objectKey: z.string().min(1).max(400),
    fileName: z.string().max(255).optional(),
    contentType: z.enum(ALLOWED_PHOTO_TYPES).optional(),
    sizeBytes: z.number().int().positive().max(MAX_PHOTO_BYTES).optional(),
  })
  .openapi("ConfirmDprPhotoRequest");

export const deleteDprResultSchema = z
  .object({ id: z.string().uuid(), deleted: z.boolean() })
  .openapi("DeleteDprResult");

export const deleteDprPhotoResultSchema = z
  .object({ id: z.string().uuid(), removed: z.boolean() })
  .openapi("DeleteDprPhotoResult");
