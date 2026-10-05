/* Owner CLI for assigning client logins.
 *   npm run user:create -- --username sg-buyer1 --brand sportsgirl --name "Sportsgirl Buyer" [--role buyer|admin|owner] [--password ...]
 *   npm run user:reset  -- --username sg-buyer1 [--password ...]
 *   npm run user:disable -- --username sg-buyer1
 *   npm run user:list
 */
import { db } from "../src/lib/db";
import { createUser, resetPassword, setUserActive, UserError } from "../src/lib/users";

function flags(argv: string[]) {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) if (argv[i].startsWith("--")) out[argv[i].slice(2)] = argv[++i] ?? "";
  return out;
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const f = flags(rest);
  const need = (k: string) => {
    if (!f[k]) throw new UserError(`Missing --${k}`);
    return f[k];
  };

  if (cmd === "create") {
    const role = (f.role ?? "buyer") as "owner" | "admin" | "buyer";
    let brandId: string | null = null;
    if (role !== "owner") {
      const brand = await db.brand.findUnique({ where: { slug: need("brand") } });
      if (!brand) throw new UserError(`No brand with slug "${f.brand}". Run npm run user:list to see brands.`);
      brandId = brand.id;
    }
    const { user, password } = await createUser({
      username: need("username"),
      displayName: f.name ?? f.username,
      role,
      brandId,
      password: f.password,
    });
    console.log(`\nCreated ${user.role} "${user.username}"\nPassword: ${password}\n(shown once, it is not stored)\n`);
  } else if (cmd === "reset") {
    const { password } = await resetPassword(need("username"), f.password);
    console.log(`\nNew password for ${f.username}: ${password}\nExisting sessions have been signed out.\n`);
  } else if (cmd === "disable" || cmd === "enable") {
    await setUserActive(need("username"), cmd === "enable");
    console.log(`${cmd}d ${f.username}`);
  } else if (cmd === "list") {
    const brands = await db.brand.findMany({ orderBy: { slug: "asc" } });
    console.log("Brands:", brands.map((b) => b.slug).join(", ") || "(none)");
    const users = await db.user.findMany({ include: { brand: true }, orderBy: { username: "asc" } });
    console.table(users.map((u) => ({ username: u.username, role: u.role, brand: u.brand?.slug ?? "-", active: u.active, lastLogin: u.lastLoginAt?.toISOString() ?? "never" })));
  } else {
    console.log("Commands: create | reset | disable | enable | list");
  }
}

main()
  .catch((e) => {
    console.error(e instanceof UserError ? `Error: ${e.message}` : e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
