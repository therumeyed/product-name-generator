import { requirePageUser, hasRole } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { PRODUCT_TYPE_CATEGORY } from "@/lib/vocab/fashion";
import Header from "@/components/Header";
import GeneratorClient from "./GeneratorClient";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await requirePageUser();
  const brands = user.role === "owner" ? await db.brand.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }) : [];
  return (
    <>
      <Header user={user} />
      <main>
        <GeneratorClient productTypes={Object.keys(PRODUCT_TYPE_CATEGORY).sort()} brands={brands} isAdmin={hasRole(user, "admin")} />
      </main>
    </>
  );
}
