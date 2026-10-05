import Link from "next/link";
import { requirePageUser, } from "@/lib/auth/guards";
import SignOut from "./SignOut";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await requirePageUser();
  return (
    <>
      <header className="bar">
        <strong>{process.env.APP_NAME ?? "Product Name Optimiser"}{user.brandName ? ` · ${user.brandName}` : ""}</strong>
        <nav>
          {user.role === "owner" && <Link href="/admin/users">Users</Link>}
          <span className="muted">{user.displayName}</span>
          <SignOut />
        </nav>
      </header>
      <main>
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Generator coming in Phase 4</h2>
          <p className="muted">Auth, brand scoping and the data model are in place. The product-name form lands once the pipeline is built.</p>
        </div>
      </main>
    </>
  );
}
