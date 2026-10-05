import Link from "next/link";
import type { SessionUser } from "@/lib/auth/session";
import SignOut from "@/app/SignOut";

export default function Header({ user }: { user: SessionUser }) {
  return (
    <header className="bar">
      <strong><Link href="/" style={{ textDecoration: "none" }}>{process.env.APP_NAME ?? "Product Name Optimiser"}{user.brandName ? ` · ${user.brandName}` : ""}</Link></strong>
      <nav>
        <Link href="/history">History</Link>
        {user.role !== "buyer" && <Link href="/admin/datasets">Datasets</Link>}
        {user.role === "owner" && <Link href="/admin/users">Users</Link>}
        <span className="muted">{user.displayName}</span>
        <SignOut />
      </nav>
    </header>
  );
}
