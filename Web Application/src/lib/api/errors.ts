import { NextResponse } from "next/server";
import { ZodError } from "zod";

export class ApiRouteError extends Error {
  constructor(
    message: string,
    public status: number = 400,
    public code?: string,
    public details?: unknown
  ) {
    super(message);
    this.name = "ApiRouteError";
  }
}

export function unauthorized(message = "Unauthorized"): ApiRouteError {
  return new ApiRouteError(message, 401, "UNAUTHORIZED");
}

export function notFound(message = "Not found"): ApiRouteError {
  return new ApiRouteError(message, 404, "NOT_FOUND");
}

export function badRequest(message: string, details?: unknown): ApiRouteError {
  return new ApiRouteError(message, 400, "BAD_REQUEST", details);
}

export function jsonError(error: ApiRouteError): NextResponse {
  return NextResponse.json(
    {
      error: error.message,
      code: error.code,
      ...(error.details !== undefined ? { details: error.details } : {}),
    },
    { status: error.status }
  );
}

export function handleRouteError(error: unknown): NextResponse {
  if (error instanceof ApiRouteError) {
    return jsonError(error);
  }
  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        error: "Validation failed",
        code: "VALIDATION_ERROR",
        details: error.flatten(),
      },
      { status: 400 }
    );
  }
  console.error("[API Error]", error);
  const message =
    error instanceof Error ? error.message : "Internal server error";
  return NextResponse.json(
    { error: "Internal server error", code: "INTERNAL_ERROR", details: message },
    { status: 500 }
  );
}
