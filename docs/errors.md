# Error Handling Guidelines

The ERP must use standardized backend errors and user-friendly frontend messages.

## Goals

- Make errors predictable for frontend developers.
- Make messages understandable for users.
- Keep internal details out of public responses.
- Log enough context for debugging.
- Avoid silent failures in critical ERP operations.

## Standard Error Response

All API errors must use this shape:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Please check the submitted data.",
    "details": {}
  }
}
```

## Standard Success Response

All API success responses must use this shape:

```json
{
  "success": true,
  "data": {},
  "meta": {}
}
```

## Error Classes

Use custom error classes for expected failures.

Recommended classes:

- AppError
- ValidationError
- AuthenticationError
- AuthorizationError
- NotFoundError
- ConflictError
- RateLimitError
- IdempotencyError
- UploadError
- QueueJobError
- DatabaseError

## Error Codes

Use stable error codes.

Common codes:

- VALIDATION_ERROR
- AUTHENTICATION_REQUIRED
- INVALID_CREDENTIALS
- TOKEN_EXPIRED
- REFRESH_TOKEN_REUSED
- PERMISSION_DENIED
- NOT_FOUND
- CONFLICT
- RATE_LIMITED
- IDEMPOTENCY_CONFLICT
- FILE_TOO_LARGE
- INVALID_FILE_TYPE
- UPLOAD_FAILED
- EXPORT_FAILED
- DATABASE_ERROR
- INTERNAL_SERVER_ERROR

## User-Friendly Messages

Messages should explain what the user can do next.

Good:

```txt
You do not have permission to approve this expense.
```

Bad:

```txt
RBAC action failed for module expenses with scope mismatch.
```

Good:

```txt
This material entry was already submitted. Please refresh the page.
```

Bad:

```txt
Duplicate idempotency key.
```

## Validation Errors

Validation errors should include field-level details.

Example:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Please check the submitted data.",
    "details": {
      "fields": {
        "siteId": "Site is required.",
        "quantity": "Quantity must be greater than zero."
      }
    }
  }
}
```

## Authentication Errors

Authentication errors include:

- Missing access token
- Invalid access token
- Expired access token
- Invalid refresh token
- Refresh token reuse

Do not expose token internals in the response.

## Authorization Errors

Authorization errors happen when the user is authenticated but does not have permission.

Example message:

```txt
You do not have permission to view salary records.
```

Backend must still enforce permission even if the frontend hides the button or page.

## Rate Limit Errors

Rate limit responses must include a user-friendly message.

Example:

```txt
Too many attempts. Please try again after a few minutes.
```

Use rate limiting especially for:

- Login
- Refresh token
- File upload URL creation
- Export generation
- Public endpoints

## Idempotency Errors

Critical operations should use idempotency keys.

Use idempotency for:

- Inventory stock movement
- Salary generation
- Payment entry
- Purchase creation
- Export generation

If the same idempotency key is sent with different payload data, return `IDEMPOTENCY_CONFLICT`.

## File Upload Errors

File upload errors should cover:

- File too large
- Invalid file type
- Upload URL expired
- Upload confirmation failed
- R2 upload failed
- Image compression failed

Compression or enhancement failures should not corrupt the original file metadata.

## Queue Job Errors

Queue jobs must log retries and final failure state.

For failed PDF or Excel exports:

- Keep job status visible to the user.
- Allow retry when safe.
- Log job ID and correlation ID.
- Do not create duplicate exports unless requested.

## Logging Errors

Use Pino for structured logs.

Each error log should include:

- Error code
- Request ID
- Correlation ID
- Route
- Method
- Status code
- User ID when available
- Company/tenant ID when available
- Stack trace for internal logs only

Never log:

- Passwords
- Access tokens
- Refresh tokens
- OAuth secrets
- Sensitive salary/payment details

## Frontend Error Display

Frontend should:

- Show field errors near inputs.
- Show action errors near the failed button or form.
- Show toast messages for save/export/upload failures.
- Show retry options for failed list/detail fetches.
- Avoid showing raw stack traces or internal codes to users.

Internal error codes can be used for developer debugging, but the main visible text should be user-friendly.
