import { prisma } from "./prisma";
import { seal, tryOpen } from "./crypto";

/**
 * Admin-tunable instance configuration. Sensitive fields ending in `Cipher`
 * are AES-256-GCM-sealed using APP_SECRET (see crypto.ts) and never returned
 * to the client in plaintext — the admin UI shows only a redacted preview
 * and offers a separate "rotate" action to set a new value.
 */

export interface AuthConfig {
  signupEnabled: boolean;
  emailVerificationRequired: boolean;
  sessionTtlDays: number;
  maxFailedSignins: number;
}

export interface MailConfig {
  provider: "smtp" | "none";
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
  smtpPasswordCipher?: string;
  fromName?: string;
  fromEmail?: string;
}

export interface BackupConfig {
  enabled: boolean;
  endpoint?: string;
  region?: string;
  bucket?: string;
  accessKeyId?: string;
  secretAccessKeyCipher?: string;
  scheduleCron?: string;
  lastRunAt?: string;
  lastResult?: "ok" | "error";
}

export interface ObservabilityConfig {
  logLevel: "debug" | "info" | "warn" | "error";
  sentryDsn?: string;
  retainAuditDays?: number;
}

export interface AiConfig {
  enabled: boolean;
  provider: "openai";
  model: string;
  apiKeyCipher?: string | null;
}

export interface AdminConfigShape {
  authConfig: AuthConfig;
  mailConfig: MailConfig;
  backupConfig: BackupConfig;
  aiConfig: AiConfig;
  observability: ObservabilityConfig;
}

const DEFAULT_AUTH: AuthConfig = {
  signupEnabled: true,
  emailVerificationRequired: false,
  sessionTtlDays: 30,
  maxFailedSignins: 10
};
const DEFAULT_MAIL: MailConfig = { provider: "none" };
const DEFAULT_BACKUP: BackupConfig = { enabled: false };
const DEFAULT_AI: AiConfig = {
  enabled: false,
  provider: "openai",
  model: "gpt-5.4-mini"
};
const DEFAULT_OBSERVABILITY: ObservabilityConfig = { logLevel: "info" };

const SINGLETON_ID = "singleton";

export async function loadAdminConfig(): Promise<AdminConfigShape> {
  let row = await prisma.adminConfig.findUnique({ where: { id: SINGLETON_ID } });
  if (!row) {
    row = await prisma.adminConfig.create({
      data: {
        id: SINGLETON_ID,
        authConfig: DEFAULT_AUTH as object,
        mailConfig: DEFAULT_MAIL as object,
        backupConfig: DEFAULT_BACKUP as object,
        aiConfig: DEFAULT_AI as object,
        observability: DEFAULT_OBSERVABILITY as object
      }
    });
  }
  return {
    authConfig: { ...DEFAULT_AUTH, ...((row.authConfig as object) || {}) } as AuthConfig,
    mailConfig: { ...DEFAULT_MAIL, ...((row.mailConfig as object) || {}) } as MailConfig,
    backupConfig: { ...DEFAULT_BACKUP, ...((row.backupConfig as object) || {}) } as BackupConfig,
    aiConfig: { ...DEFAULT_AI, ...((row.aiConfig as object) || {}) } as AiConfig,
    observability: {
      ...DEFAULT_OBSERVABILITY,
      ...((row.observability as object) || {})
    } as ObservabilityConfig
  };
}

async function patchSegment<K extends keyof AdminConfigShape>(
  segment: K,
  patch: Partial<AdminConfigShape[K]>
): Promise<AdminConfigShape[K]> {
  const cur = await loadAdminConfig();
  const next = { ...cur[segment], ...patch } as AdminConfigShape[K];
  await prisma.adminConfig.upsert({
    where: { id: SINGLETON_ID },
    create: {
      id: SINGLETON_ID,
      authConfig: cur.authConfig as object,
      mailConfig: cur.mailConfig as object,
      backupConfig: cur.backupConfig as object,
      aiConfig: cur.aiConfig as object,
      observability: cur.observability as object,
      [segment]: next as object
    },
    update: { [segment]: next as object }
  });
  return next;
}

export const saveAuthConfig = (p: Partial<AuthConfig>) =>
  patchSegment("authConfig", p);
export const saveMailConfig = (p: Partial<MailConfig>) =>
  patchSegment("mailConfig", p);
export const saveBackupConfig = (p: Partial<BackupConfig>) =>
  patchSegment("backupConfig", p);
export const saveAiConfig = (p: Partial<AiConfig>) =>
  patchSegment("aiConfig", p);
export const saveObservabilityConfig = (p: Partial<ObservabilityConfig>) =>
  patchSegment("observability", p);

/** Seal a plaintext secret. Pass null/empty to clear. */
export function sealSecret(plain: string | null | undefined): string | null {
  if (!plain) return null;
  return seal(plain);
}

export function revealSecret(sealed: string | null | undefined): string | null {
  return tryOpen(sealed);
}

/**
 * Render a redacted preview of a sealed secret for the admin UI. Decrypts
 * just to count length and show the last 2 chars; if decryption fails (key
 * rotated) the helper returns "•••••• (unreadable)" so the operator can
 * re-enter the value.
 */
export function redactedPreview(sealed: string | null | undefined): string {
  if (!sealed) return "";
  const plain = tryOpen(sealed);
  if (plain == null) return "•••••• (unreadable — re-enter)";
  if (plain.length <= 2) return "•".repeat(plain.length);
  return "•".repeat(Math.min(8, plain.length - 2)) + plain.slice(-2);
}

/**
 * Public-safe view of the config: secrets are stripped. Use this anywhere
 * you respond to the admin UI — never serve `loadAdminConfig` directly.
 */
export interface PublicAdminConfig {
  authConfig: AuthConfig;
  mailConfig: Omit<MailConfig, "smtpPasswordCipher"> & {
    smtpPasswordPreview: string;
    smtpPasswordSet: boolean;
  };
  backupConfig: Omit<BackupConfig, "secretAccessKeyCipher"> & {
    secretAccessKeyPreview: string;
    secretAccessKeySet: boolean;
  };
  aiConfig: Omit<AiConfig, "apiKeyCipher"> & {
    apiKeyPreview: string;
    apiKeySet: boolean;
  };
  observability: ObservabilityConfig;
}

export async function loadPublicAdminConfig(): Promise<PublicAdminConfig> {
  const cfg = await loadAdminConfig();
  const { smtpPasswordCipher, ...mail } = cfg.mailConfig;
  const { secretAccessKeyCipher, ...backup } = cfg.backupConfig;
  const { apiKeyCipher, ...ai } = cfg.aiConfig;
  return {
    authConfig: cfg.authConfig,
    mailConfig: {
      ...mail,
      smtpPasswordPreview: redactedPreview(smtpPasswordCipher),
      smtpPasswordSet: !!smtpPasswordCipher
    },
    backupConfig: {
      ...backup,
      secretAccessKeyPreview: redactedPreview(secretAccessKeyCipher),
      secretAccessKeySet: !!secretAccessKeyCipher
    },
    aiConfig: {
      ...ai,
      apiKeyPreview: redactedPreview(apiKeyCipher),
      apiKeySet: !!apiKeyCipher
    },
    observability: cfg.observability
  };
}
