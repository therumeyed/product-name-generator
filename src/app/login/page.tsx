"use client";
import { useState } from "react";

export default function LoginPage() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: f.get("username"), password: f.get("password") }),
    });
    if (res.ok) {
      window.location.href = "/";
      return;
    }
    setError((await res.json().catch(() => ({}))).error ?? "Sign in failed");
    setBusy(false);
  }

  return (
    <main style={{ maxWidth: 380, paddingTop: 80 }}>
      <form className="card" onSubmit={submit}>
        <h1 style={{ marginTop: 0, fontSize: 20 }}>Sign in</h1>
        <p className="muted" style={{ marginTop: 0 }}>Use the login you were given. No login? Ask your account manager.</p>
        <label htmlFor="username">Username</label>
        <input id="username" name="username" autoComplete="username" autoCapitalize="none" required />
        <label htmlFor="password">Password</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required />
        {error && <p className="err">{error}</p>}
        <p><button disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button></p>
      </form>
    </main>
  );
}
