import nodemailer, { type Transporter } from "nodemailer";
import { loadAdminConfig, revealSecret, type MailConfig } from "./admin-config";
import { log } from "./logger";

/**
 * Mail adapter — single entrypoint everything goes through.
 *
 * Reads SMTP credentials from the admin config singleton (sealed at rest),
 * unseals just-in-time, builds a transporter, and sends. When the admin has
 * left provider="none" we log the message + body to stdout so dev / first
 * boot still produces *something* visible — production deploys MUST switch
 * to `smtp` before going public, otherwise password-reset and verification
 * mails won't reach users.
 */

export interface MailMessage {
  to: string;
  subject: string;
  /** Plaintext body. We send text-only — no HTML — to keep the surface tiny. */
  text: string;
}

function smtpTlsOptions(m: MailConfig) {
  const mode = m.smtpTlsMode ?? "auto";
  if (mode === "ssl") return { secure: true };
  if (mode === "starttls") return { secure: false, requireTLS: true };
  if (mode === "none") return { secure: false, ignoreTLS: true };
  if (m.smtpPort === 465) return { secure: true };
  if (m.smtpPort === 587) return { secure: false, requireTLS: true };
  return { secure: false };
}

function defaultFromEmail(m: MailConfig): string {
  if (m.fromEmail) return m.fromEmail;
  if (m.smtpUser?.includes("@")) return m.smtpUser;
  return `no-reply@${m.smtpHost}`;
}

/**
 * Build a nodemailer transporter from current admin config. Returns null
 * when SMTP isn't configured; callers should fall back to logging.
 */
async function buildTransporter(): Promise<{
  transporter: Transporter;
  from: { name: string; address: string };
} | null> {
  const cfg = await loadAdminConfig();
  const m = cfg.mailConfig;
  const smtpHost = m.smtpHost?.trim();
  if (m.provider !== "smtp" || !smtpHost || !m.smtpPort) return null;

  const password = revealSecret(m.smtpPasswordCipher);
  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: m.smtpPort,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
    tls: { servername: smtpHost },
    ...smtpTlsOptions(m),
    auth:
      m.smtpUser && password
        ? { user: m.smtpUser, pass: password }
        : undefined
  });

  const fromName = m.fromName ?? "TL Finance Core";
  return {
    transporter,
    from: { name: fromName, address: defaultFromEmail(m) }
  };
}

export async function sendMail(msg: MailMessage): Promise<{
  delivered: boolean;
  reason?: string;
}> {
  let built: Awaited<ReturnType<typeof buildTransporter>> = null;
  try {
    built = await buildTransporter();
  } catch (err) {
    log.error("mailer: failed to build transporter", {
      err: err instanceof Error ? err.message : String(err)
    });
  }

  if (!built) {
    // Provider not configured. In development we include the body so the
    // first-boot loop can recover reset/verification links. Production logs
    // must never contain bearer auth links.
    log.warn("mailer: provider not configured", {
      to: msg.to,
      subject: msg.subject,
      ...(process.env.NODE_ENV === "production" ? {} : { body: msg.text })
    });
    return { delivered: false, reason: "provider_not_configured" };
  }

  try {
    await built.transporter.sendMail({
      from: built.from,
      to: msg.to,
      subject: msg.subject,
      text: msg.text
    });
    log.info("mailer: sent", { to: msg.to, subject: msg.subject });
    return { delivered: true };
  } catch (err) {
    log.error("mailer: send failed", {
      to: msg.to,
      subject: msg.subject,
      err: err instanceof Error ? err.message : String(err)
    });
    return {
      delivered: false,
      reason: err instanceof Error ? err.message : "send_failed"
    };
  }
}
