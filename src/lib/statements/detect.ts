import { genericCsvParser } from "./parsers/generic-csv";
import type {
  NormalizedStatement,
  ParserDetection,
  StatementInput,
  StatementParser
} from "./types";

export const STATEMENT_PARSERS: StatementParser[] = [genericCsvParser];

export function detectStatementParser(input: StatementInput): {
  parser: StatementParser | null;
  detection: ParserDetection;
  candidates: Array<{ key: string; detection: ParserDetection }>;
} {
  const candidates = STATEMENT_PARSERS.map((parser) => ({
    key: parser.key,
    parser,
    detection: parser.detect(input)
  })).sort((a, b) => b.detection.confidence - a.detection.confidence);
  const best = candidates.find((candidate) => candidate.detection.matched);
  return {
    parser: best?.parser ?? null,
    detection: best?.detection ?? {
      matched: false,
      confidence: 0,
      reason: "No parser recognized the statement"
    },
    candidates: candidates.map(({ key, detection }) => ({ key, detection }))
  };
}

export async function parseStatementInput({
  input,
  parserKey
}: {
  input: StatementInput;
  parserKey?: string | null;
}): Promise<NormalizedStatement> {
  const parser = parserKey
    ? STATEMENT_PARSERS.find((candidate) => candidate.key === parserKey)
    : detectStatementParser(input).parser;
  if (!parser) {
    throw statusError(
      parserKey
        ? `Statement parser "${parserKey}" is not registered`
        : "No registered statement parser recognized this file",
      422
    );
  }

  const detection = parser.detect(input);
  if (!detection.matched) {
    throw statusError(detection.reason, 422);
  }
  return parser.parse(input);
}

function statusError(message: string, status: number): Error {
  const err = new Error(message) as Error & { status: number };
  err.status = status;
  return err;
}
