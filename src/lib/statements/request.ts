import type { NextRequest } from "next/server";
import { statementImportJsonSchema } from "@/lib/schemas";
import { createStatementInput } from "./normalize";
import type { StatementInput } from "./types";

export const MAX_STATEMENT_IMPORT_BYTES = 5 * 1024 * 1024;

export interface StatementImportRequest {
  input: StatementInput;
  parserKey?: string | null;
  accountId?: string | null;
}

export async function readStatementImportRequest(
  req: NextRequest
): Promise<StatementImportRequest> {
  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    return readMultipartRequest(req);
  }

  const body = statementImportJsonSchema.parse(await req.json());
  const bytes = Buffer.from(body.content, "utf8");
  assertSize(bytes.byteLength);
  return {
    input: createStatementInput({
      fileName: body.fileName,
      mimeType: body.mimeType ?? "text/plain",
      text: body.content,
      bytes,
      defaultCurrency: body.defaultCurrency
    }),
    parserKey: body.parserKey,
    accountId: body.accountId
  };
}

async function readMultipartRequest(
  req: NextRequest
): Promise<StatementImportRequest> {
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    throw statusError("Statement file is required", 422);
  }
  assertSize(file.size);

  const bytes = new Uint8Array(await file.arrayBuffer());
  const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  return {
    input: createStatementInput({
      fileName: file.name,
      mimeType: file.type || null,
      text,
      bytes,
      defaultCurrency: formString(form, "defaultCurrency")
    }),
    parserKey: formString(form, "parserKey"),
    accountId: formString(form, "accountId")
  };
}

function formString(form: FormData, key: string): string | null {
  const value = form.get(key);
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function assertSize(size: number): void {
  if (size > MAX_STATEMENT_IMPORT_BYTES) {
    throw statusError("Statement file is too large", 413);
  }
}

function statusError(message: string, status: number): Error {
  const err = new Error(message) as Error & { status: number };
  err.status = status;
  return err;
}
