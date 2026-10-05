"use client";
import { useState } from "react";

type U = { username: string; displayName: string; role: string; brand: string; active: boolean; lastLogin: string };
type B = { id: string; name: string };

export default function UsersClient({ users, brands }: { users: U[]; brands: B[] }) {
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  async function call(method: string, body: unknown) {
    setError("");
    const res = await fetch("/api/admin/users", { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Failed");
      return null;
    }
    return data;
  }

  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const data = await call("POST", {
      username: f.get("username"),
      displayName: f.get("displayName"),
      brandId: f.get("brandId"),
      role: f.get("role"),
      password: f.get("password") || undefined,
    });
    if (data) {
      setMsg(`Created "${data.username}". Password: ${data.password} (shown once, copy it now)`);
      setTimeout(() => location.reload(), 15000);
    }
  }

  async function act(action: "reset_password" | "disable" | "enable", username: string) {
    if (action === "reset_password" && !confirm(`Reset password for ${username}? They'll be signed out.`)) return;
    const data = await call("PATCH", { action, username });
    if (!data) return;
    if (action === "reset_password") setMsg(`New password for "${username}": ${data.password} (shown once)`);
    else location.reload();
  }

  return (
    <>
      <form className="card" onSubmit={create}>
        <strong>New login</strong>
        <label>Username</label><input name="username" required autoCapitalize="none" />
        <label>Display name</label><input name="displayName" />
        <label>Brand</label>
        <select name="brandId" required>{brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
        <label>Role</label>
        <select name="role"><option value="buyer">Buyer</option><option value="admin">Brand admin</option></select>
        <label>Password (leave blank to generate one)</label><input name="password" autoComplete="off" />
        <p><button>Create login</button></p>
      </form>
      {msg && <p className="card" style={{ marginTop: 16 }}><code>{msg}</code></p>}
      {error && <p className="err">{error}</p>}
      <table style={{ marginTop: 24 }}>
        <thead><tr><th>Username</th><th>Brand</th><th>Role</th><th>Last login</th><th /></tr></thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.username} style={{ opacity: u.active ? 1 : 0.5 }}>
              <td>{u.username}<br /><span className="muted">{u.displayName}</span></td>
              <td>{u.brand}</td><td>{u.role}</td><td>{u.lastLogin}</td>
              <td>
                <button className="link" onClick={() => act("reset_password", u.username)}>Reset password</button>{" · "}
                <button className="link" onClick={() => act(u.active ? "disable" : "enable", u.username)}>{u.active ? "Disable" : "Enable"}</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
