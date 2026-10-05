"use client";
import { useRef, useState } from "react";
import ResultView, { type Gen } from "@/components/ResultView";

const STEPS = ["Understanding the product", "Matching search demand", "Reviewing search results", "Building the recommendation"];
const STAGE: Record<string, number> = { pending: 0, extracting: 0, matching: 1, searching: 2, building: 3 };
const FIELDS: [string, string, string][] = [
  ["colour", "Colour", "black"], ["material", "Material", "mesh"], ["pattern", "Pattern or finish", "floral"], ["fit", "Fit or silhouette", "wrap"],
  ["length", "Length", "midi"], ["feature", "Key feature or detail", "ruched"], ["occasion", "Occasion or style", "cocktail"], ["audience", "Audience / department", ""],
];

export default function GeneratorClient({ productTypes, brands, isAdmin }: { productTypes: string[]; brands: { id: string; name: string }[]; isAdmin: boolean }) {
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState(0);
  const [gen, setGen] = useState<Gen | null>(null);
  const [error, setError] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function poll(id: string, started = Date.now()) {
    const res = await fetch(`/api/generations/${id}`, { cache: "no-store" });
    if (!res.ok) { setBusy(false); setError("Lost track of that request. Check History."); return; }
    const g = await res.json();
    if (g.status in STAGE) {
      setStage(STAGE[g.status]);
      if (Date.now() - started > 120_000) { setBusy(false); setError("This is taking too long. Check History in a minute."); return; }
      timer.current = setTimeout(() => poll(id, started), 900);
    } else { setGen(g); setBusy(false); }
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setError(""); setGen(null); setStage(0);
    const f = Object.fromEntries(new FormData(e.currentTarget).entries());
    const res = await fetch("/api/generations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(f) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setBusy(false); setError(data.error ?? "Something went wrong"); return; }
    poll(data.id);
  }

  async function retry() {
    if (!gen) return;
    setBusy(true); setError("");
    const id = gen.id; setGen(null); setStage(3);
    const res = await fetch(`/api/generations/${id}/retry`, { method: "POST" });
    if (!res.ok) { setBusy(false); setError((await res.json().catch(() => ({}))).error ?? "Retry failed"); return; }
    poll(id);
  }

  return (
    <>
      <form className="card" onSubmit={submit}>
        <p className="muted" style={{ margin: "0 0 4px" }}>Use only the details entered here. Anything left blank is treated as unknown, never guessed.</p>
        {/* Owners aren't tied to a brand, so the brand is always sent: a picker if there are several, hidden if just one. */}
        {brands.length === 1 && <input type="hidden" name="brandId" value={brands[0].id} />}
        {brands.length > 1 && (<><label>Brand</label><select name="brandId" required>{brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></>)}
        <label htmlFor="freeText">What would you call this product? *</label>
        <input id="freeText" name="freeText" required maxLength={500} placeholder="black dress with ruching, midi length, mesh sleeves" />
        <label htmlFor="productType">Product type *</label>
        <input id="productType" name="productType" required list="ptypes" maxLength={60} placeholder="dress" />
        <datalist id="ptypes">{productTypes.map((t) => <option key={t} value={t} />)}</datalist>
        <div className="row">
          {FIELDS.map(([name, label, ph]) => (
            <div key={name}><label htmlFor={name}>{label}</label><input id={name} name={name} maxLength={120} placeholder={ph ? `e.g. ${ph}` : ""} /></div>
          ))}
        </div>
        <label htmlFor="extra">Extra product facts</label>
        <input id="extra" name="extra" maxLength={2000} />
        <p><button disabled={busy}>{busy ? "Working…" : "Generate product name"}</button></p>
      </form>

      {busy && (
        <div className="card" style={{ marginTop: 16 }} aria-live="polite">
          <ol className="steps">{STEPS.map((s, i) => <li key={s} className={i < stage ? "done" : i === stage ? "on" : ""}>{s}{i === stage ? "…" : ""}</li>)}</ol>
        </div>
      )}
      {error && <p className="err">{error}</p>}
      {gen && <div style={{ marginTop: 16 }}><ResultView gen={gen} canFeedback isAdmin={isAdmin} onRetry={retry} /></div>}
    </>
  );
}
