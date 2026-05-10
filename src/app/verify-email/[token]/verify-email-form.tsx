"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type Status = "verifying" | "ok" | "error";

export function VerifyEmailForm({ token }: { token: string }) {
  const [status, setStatus] = useState<Status>("verifying");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/auth/verify-email/${encodeURIComponent(token)}`, {
      method: "POST"
    })
      .then(async (res) => {
        if (cancelled) return;
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || "Verification failed");
        setStatus("ok");
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Verification failed");
        setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Email verification</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {status === "verifying" && (
          <p className="text-sm text-muted-foreground">Verifying your email…</p>
        )}
        {status === "ok" && (
          <>
            <p className="text-sm">
              Your email is verified. You can now use the app normally.
            </p>
            <Link href="/">
              <Button className="w-full">Go to dashboard</Button>
            </Link>
          </>
        )}
        {status === "error" && (
          <>
            <p className="text-sm text-destructive">{error}</p>
            <p className="text-xs text-muted-foreground">
              If the link expired, sign in and request a fresh verification
              email.
            </p>
            <Link href="/signin">
              <Button variant="outline" className="w-full">
                Sign in
              </Button>
            </Link>
          </>
        )}
      </CardContent>
    </Card>
  );
}
