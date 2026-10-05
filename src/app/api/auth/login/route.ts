import { z } from "zod";
import { attemptLogin } from "@/lib/auth/login";
import { setSessionCookie } from "@/lib/auth/session";

const body = z.object({ username: z.string().min(1).max(100), password: z.string().min(1).max(200) });

export async function POST(req: Request) {
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Enter a username and password" }, { status: 400 });
  const result = await attemptLogin(parsed.data.username, parsed.data.password);
  if (!result.ok) return Response.json({ error: result.error }, { status: 401 });
  await setSessionCookie(result.token);
  return Response.json({ ok: true });
}
