import Link from "next/link";
import { requirePageUser } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import UsersClient from "./UsersClient";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  await requirePageUser("owner");
  const [users, brands] = await Promise.all([
    db.user.findMany({ orderBy: { createdAt: "desc" }, include: { brand: true } }),
    db.brand.findMany({ orderBy: { name: "asc" } }),
  ]);
  return (
    <main>
      <p><Link href="/">← Back</Link></p>
      <h1 style={{ fontSize: 22 }}>Client logins</h1>
      <UsersClient
        brands={brands.map((b) => ({ id: b.id, name: b.name }))}
        users={users.map((u) => ({
          username: u.username,
          displayName: u.displayName,
          role: u.role,
          brand: u.brand?.name ?? "—",
          active: u.active,
          lastLogin: u.lastLoginAt?.toISOString().slice(0, 16).replace("T", " ") ?? "never",
        }))}
      />
    </main>
  );
}
