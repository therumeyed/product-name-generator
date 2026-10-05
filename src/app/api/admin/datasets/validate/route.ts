import { z } from "zod";
import { assertBrandAccess, errorResponse, HttpError, requireUser } from "@/lib/auth/guards";
import { importKeywords } from "@/lib/keywords/import";
import { suggestMapping, TARGETS, VOLUME_RULES, validateMapping } from "@/lib/keywords/mapping";
import { openFile } from "@/lib/keywords/readers";
import { rateLimit } from "@/lib/rateLimit";

export const maxDuration = 300;
const MAX_BYTES = 30 * 1024 * 1024;

const options = z.object({
  brandId: z.string().uuid().optional(),
  name: z.string().min(1).max(120).optional(),
  sheet: z.string().optional(),
  volumeRule: z.enum(VOLUME_RULES as [string, ...string[]]).default("max"),
  mapping: z.record(z.string(), z.enum(TARGETS)).optional(),
});

/**
 * Two-step, stateless flow (the file is never stored):
 *  1. POST file only            -> headers, suggested mapping, first rows as a preview
 *  2. POST file + mapping + name -> full validation + import as a NEW, inactive dataset version
 */
export async function POST(req: Request) {
  try {
    const user = await requireUser("admin");
    if (!rateLimit(`upload:${user.id}`, 10, 3_600_000)) throw new HttpError(429, "Too many uploads. Try again later.");

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new HttpError(400, "Attach a file");
    if (file.size > MAX_BYTES) throw new HttpError(413, "File too large (30MB max)");
    const opts = options.parse({
      brandId: form.get("brandId") || undefined,
      name: form.get("name") || undefined,
      sheet: form.get("sheet") || undefined,
      volumeRule: form.get("volumeRule") || undefined,
      mapping: form.get("mapping") ? JSON.parse(String(form.get("mapping"))) : undefined,
    });
    const brandId = opts.brandId ?? user.brandId;
    if (!brandId) throw new HttpError(400, "brandId required");
    assertBrandAccess(user, brandId);

    const buf = Buffer.from(await file.arrayBuffer());
    const source = await openFile(buf, file.name, opts.sheet).catch((e) => { throw new HttpError(400, e.message); });

    if (!opts.mapping) {
      const preview: Record<string, unknown>[] = [];
      for await (const r of source.rows) { preview.push(r.cells); if (preview.length >= 10) break; }
      return Response.json({ headers: source.headers, suggestedMapping: suggestMapping(source.headers), preview });
    }

    const bad = validateMapping(opts.mapping);
    if (bad) throw new HttpError(400, bad);
    const summary = await importKeywords({
      brandId, name: opts.name ?? file.name, filename: file.name, source,
      mapping: opts.mapping, volumeRule: opts.volumeRule as (typeof VOLUME_RULES)[number], uploadedById: user.id,
    });
    return Response.json(summary, { status: 201 });
  } catch (e) {
    if (e instanceof z.ZodError) return Response.json({ error: "Invalid options" }, { status: 400 });
    if (e instanceof Error && !(e instanceof HttpError) && /No valid rows|Map exactly|Only one column/.test(e.message)) {
      return Response.json({ error: e.message }, { status: 400 });
    }
    return errorResponse(e);
  }
}
