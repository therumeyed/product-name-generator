import { z } from "zod";
import { db } from "@/lib/db";
import { errorResponse, requireUser } from "@/lib/auth/guards";
import { createUser, resetPassword, setUserActive, UserError } from "@/lib/users";

// Owner-only. Clients never create or change their own credentials.

export async function GET() {
  try {
    await requireUser("owner");
    const users = await db.user.findMany({
      orderBy: { createdAt: "desc" },
      select: { id: true, username: true, displayName: true, role: true, active: true, lastLoginAt: true, brand: { select: { id: true, name: true } } },
    });
    return Response.json({ users });
  } catch (e) {
    return errorResponse(e);
  }
}

const createBody = z.object({
  username: z.string(),
  displayName: z.string().max(100),
  role: z.enum(["admin", "buyer"]),
  brandId: z.string().uuid(),
  password: z.string().optional(), // omit to auto-generate
});

export async function POST(req: Request) {
  try {
    const actor = await requireUser("owner");
    const input = createBody.parse(await req.json());
    const { user, password } = await createUser({ ...input, actorId: actor.id });
    return Response.json({ id: user.id, username: user.username, password }, { status: 201 });
  } catch (e) {
    if (e instanceof UserError) return Response.json({ error: e.message }, { status: 400 });
    if (e instanceof z.ZodError) return Response.json({ error: "Invalid input" }, { status: 400 });
    return errorResponse(e);
  }
}

const patchBody = z.discriminatedUnion("action", [
  z.object({ action: z.literal("reset_password"), username: z.string(), password: z.string().optional() }),
  z.object({ action: z.literal("disable"), username: z.string() }),
  z.object({ action: z.literal("enable"), username: z.string() }),
]);

export async function PATCH(req: Request) {
  try {
    const actor = await requireUser("owner");
    const input = patchBody.parse(await req.json());
    if (input.action === "reset_password") {
      const { password } = await resetPassword(input.username, input.password, actor.id);
      return Response.json({ username: input.username, password });
    }
    if (input.username.toLowerCase() === actor.username && input.action === "disable") {
      return Response.json({ error: "You can't disable yourself" }, { status: 400 });
    }
    await setUserActive(input.username, input.action === "enable", actor.id);
    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof UserError) return Response.json({ error: e.message }, { status: 400 });
    if (e instanceof z.ZodError) return Response.json({ error: "Invalid input" }, { status: 400 });
    return errorResponse(e);
  }
}
