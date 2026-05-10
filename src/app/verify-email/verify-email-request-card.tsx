"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type Status = "idle" | "sending" | "sent" | "error";

export function VerifyEmailRequestCard({ email }: { email: string }) {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  async function resend() {
    setStatus("sending");
    setError(null);
    try {
      const res = await fetch("/api/auth/verify-email/request", {
        method: "POST"
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not send email");
      setStatus("sent");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send email");
      setStatus("error");
    }
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Verify your email</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Check {email} for the verification link before continuing.
        </p>
        <Button
          type="button"
          onClick={resend}
          disabled={status === "sending"}
          className="w-full"
        >
          {status === "sending" ? "Sending..." : "Send verification email"}
        </Button>
        {status === "sent" && (
          <p className="text-sm text-success" role="status">
            Verification email sent.
          </p>
        )}
        {status === "error" && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
