import { beforeEach, describe, expect, it, vi } from "vitest";
import { sendMail } from "./mailer";

const state = vi.hoisted(() => ({
  cfg: {
    mailConfig: { provider: "none" }
  } as { mailConfig: Record<string, unknown> },
  createTransport: vi.fn(),
  sendMail: vi.fn(),
  logInfo: vi.fn(),
  logWarn: vi.fn(),
  logError: vi.fn()
}));

vi.mock("nodemailer", () => ({
  default: {
    createTransport: state.createTransport
  }
}));

vi.mock("./admin-config", () => ({
  loadAdminConfig: async () => state.cfg,
  revealSecret: (cipher: string | null | undefined) =>
    cipher === "sealed-password" ? "smtp-password" : null
}));

vi.mock("./logger", () => ({
  log: {
    info: state.logInfo,
    warn: state.logWarn,
    error: state.logError
  }
}));

const message = {
  to: "user@example.test",
  subject: "Subject",
  text: "Body"
};

describe("sendMail", () => {
  beforeEach(() => {
    state.cfg = {
      mailConfig: { provider: "none" }
    };
    state.createTransport.mockReset();
    state.sendMail.mockReset();
    state.logInfo.mockReset();
    state.logWarn.mockReset();
    state.logError.mockReset();
    state.createTransport.mockReturnValue({ sendMail: state.sendMail });
    state.sendMail.mockResolvedValue({});
  });

  it("logs instead of sending when SMTP is not configured", async () => {
    const result = await sendMail(message);

    expect(result).toEqual({
      delivered: false,
      reason: "provider_not_configured"
    });
    expect(state.createTransport).not.toHaveBeenCalled();
    expect(state.logWarn).toHaveBeenCalledWith(
      "mailer: provider not configured; logging mail to stdout",
      expect.objectContaining({ to: message.to, body: message.text })
    );
  });

  it("requires STARTTLS on port 587 and authenticates with the sealed password", async () => {
    state.cfg = {
      mailConfig: {
        provider: "smtp",
        smtpHost: "smtp.example.test",
        smtpPort: 587,
        smtpTlsMode: "starttls",
        smtpUser: "mailer@example.test",
        smtpPasswordCipher: "sealed-password",
        fromName: "TL Finance",
        fromEmail: "no-reply@example.test"
      }
    };

    await sendMail(message);

    expect(state.createTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        host: "smtp.example.test",
        port: 587,
        secure: false,
        requireTLS: true,
        auth: { user: "mailer@example.test", pass: "smtp-password" }
      })
    );
    expect(state.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: { name: "TL Finance", address: "no-reply@example.test" },
        to: message.to
      })
    );
  });

  it("uses implicit TLS on port 465 and defaults from email to the SMTP user", async () => {
    state.cfg = {
      mailConfig: {
        provider: "smtp",
        smtpHost: "smtp.example.test",
        smtpPort: 465,
        smtpUser: "mailer@example.test"
      }
    };

    await sendMail(message);

    expect(state.createTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        host: "smtp.example.test",
        port: 465,
        secure: true
      })
    );
    expect(state.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: {
          name: "TL Finance Core",
          address: "mailer@example.test"
        }
      })
    );
  });

  it("returns the provider error when SMTP send fails", async () => {
    state.cfg = {
      mailConfig: {
        provider: "smtp",
        smtpHost: "smtp.example.test",
        smtpPort: 587
      }
    };
    state.sendMail.mockRejectedValue(new Error("relay denied"));

    const result = await sendMail(message);

    expect(result).toEqual({ delivered: false, reason: "relay denied" });
    expect(state.logError).toHaveBeenCalledWith(
      "mailer: send failed",
      expect.objectContaining({ err: "relay denied" })
    );
  });
});
