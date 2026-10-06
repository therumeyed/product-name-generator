"use client";
import { useState } from "react";

type Kw = { id: string; keyword: string; searchVolume: number | null; category: string | null };
type Serp = { id: string; query: string; rank: number; title: string; domain: string; pageClass: string; checkedAt: string; cached: boolean };
type Rec = {
  recommended_title: string; confidence: "high" | "medium" | "low"; primary_keyword: string | null; supporting_keywords: string[];
  title_structure: string[]; alternatives: { title: string; trade_off: string }[]; reason: string; warnings: string[];
};
export type Gen = {
  id: string; status: string; errorCode?: string | null; errorMessage?: string | null; usage?: unknown;
  result: { recommendation?: Rec; meta?: { serpStatus: string; orderFinal: string[] }; needs?: string; conflicts?: string[]; message?: string } | null;
  evidence: { keywords: Kw[]; serp: Serp[]; queries: { query: string; reason: string }[]; serpStatus: string; patterns: { intent: string; resultsAnalysed: number; productNouns: { term: string; count: number }[]; attributeWording: { term: string; count: number }[]; serpOrder: string[] | null } | null; order: { keywordOrder: string[]; serpOrder: string[] | null; final: string[] } } | null;
};

const vol = (v: number | null) => (v === null ? "volume unavailable" : `${v.toLocaleString()} searches/mo`);
const INTENT: Record<string, string> = { product_led: "Product-led", category_led: "Category-led", mixed: "Mixed intent", none: "No results" };

export default function ResultView({ gen, canFeedback, isAdmin, onRetry }: { gen: Gen; canFeedback: boolean; isAdmin: boolean; onRetry?: () => void }) {
  const rec = gen.result?.recommendation;
  const [tab, setTab] = useState<"kw" | "serp">("kw");
  const [chosen, setChosen] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [edited, setEdited] = useState("");
  const [reason, setReason] = useState("");
  const [sent, setSent] = useState("");
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState("");

  if (["pending", "extracting", "matching", "searching", "building"].includes(gen.status)) {
    return <div className="card"><strong>Still working…</strong><p className="muted">Refresh in a few seconds. If this stays here for more than a couple of minutes it will be marked as failed.</p></div>;
  }
  if (gen.status === "failed") {
    return (
      <div className="card">
        <strong>That didn&apos;t work</strong>
        <p className="muted">{gen.errorCode === "config_error" ? "This tool isn't fully set up yet, so it couldn't run. Let your account manager know." : gen.errorCode === "ai_unavailable" || gen.errorCode === "timeout" ? "The AI service didn't respond. Your details and any search evidence are saved, so retrying won't repeat the paid searches." : "We couldn't produce a valid recommendation."}</p>
        {isAdmin && gen.errorMessage && <p className="err">Admin detail: {gen.errorMessage}</p>}
        {onRetry && gen.errorCode !== "config_error" && <button onClick={onRetry}>Retry</button>}
      </div>
    );
  }
  if (gen.status === "needs_input") {
    return (
      <div className="card">
        <strong>One thing to fix first</strong>
        {gen.result?.conflicts?.map((c) => <div className="warn" key={c}>{c}</div>)}
        {gen.result?.message && <div className="warn">{gen.result.message}</div>}
        <p className="muted">No paid searches were run. Update the details above and generate again.</p>
      </div>
    );
  }
  if (!rec) return null;

  const title = chosen ?? rec.recommended_title;
  async function copy(t: string) {
    try { await navigator.clipboard.writeText(t); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard blocked */ }
  }
  async function feedback(outcome: "used" | "edited" | "rejected") {
    setErr("");
    const res = await fetch(`/api/generations/${gen.id}/feedback`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ outcome, finalTitle: outcome === "edited" ? edited : outcome === "used" ? title : undefined, reason: reason || undefined }),
    });
    if (res.ok) setSent(outcome === "used" ? `Saved: "${title}"` : outcome === "edited" ? `Saved your edit: "${edited}"` : "Noted: not suitable"); else setErr((await res.json().catch(() => ({}))).error ?? "Couldn't save feedback");
  }
  const ev = gen.evidence;
  const order = ev?.order.final ?? gen.result?.meta?.orderFinal ?? [];

  return (
    <div className="card">
      <span className={`badge ${rec.confidence}`}>{rec.confidence[0].toUpperCase() + rec.confidence.slice(1)} confidence</span>
      <div className="title-out">{title}</div>
      <div className="btns" style={{ marginTop: 0 }}>
        <button onClick={() => copy(title)}>{copied ? "Copied" : "Copy"}</button>
        {chosen && <button className="ghost" onClick={() => setChosen(null)}>Back to recommended</button>}
      </div>
      <p>{rec.reason}</p>

      {rec.warnings.map((w) => <div className="warn" key={w}>{w}</div>)}

      <p>
        {rec.primary_keyword ? <><strong>Primary keyword:</strong> {rec.primary_keyword} <span className="muted">({vol(ev?.keywords.find((k) => k.keyword === rec.primary_keyword)?.searchVolume ?? null)})</span></> : <span className="muted">No primary keyword: no matching demand data.</span>}
        {rec.supporting_keywords.length > 0 && <><br /><strong>Supporting:</strong> {rec.supporting_keywords.map((k) => `${k} (${vol(ev?.keywords.find((x) => x.keyword === k)?.searchVolume ?? null)})`).join(" · ")}</>}
      </p>

      <details>
        <summary>Why this order?</summary>
        <p className="muted">{[...(order.length ? order : rec.title_structure.slice(0, -1)), "product type"].join(" + ")}. Word order comes from how real searches are phrased in the keyword list, checked against live result titles.</p>
        {ev?.order.serpOrder && <p className="muted">Result titles used: {ev.order.serpOrder.join(" → ")}</p>}
      </details>

      {rec.alternatives.length > 0 && (<>
        <h3 style={{ fontSize: 15, marginBottom: 0 }}>Alternatives</h3>
        {rec.alternatives.map((a) => (
          <div className="alt" key={a.title}>
            <div><strong>{a.title}</strong><br /><span className="muted">{a.trade_off}</span></div>
            <button className="ghost" onClick={() => setChosen(a.title)}>Use this</button>
          </div>
        ))}
      </>)}

      {ev && (<>
        <div className="tabs" role="tablist">
          <button role="tab" className={tab === "kw" ? "on" : ""} onClick={() => setTab("kw")}>Keyword dataset matches</button>
          <button role="tab" className={tab === "serp" ? "on" : ""} onClick={() => setTab("serp")}>Live SERP patterns</button>
        </div>
        {tab === "kw" ? (
          ev.keywords.length ? (
            <table><thead><tr><th>Keyword</th><th>Volume</th><th>Category</th></tr></thead>
              <tbody>{ev.keywords.slice(0, 15).map((k) => <tr key={k.id}><td>{k.keyword}</td><td>{vol(k.searchVolume)}</td><td>{k.category ?? "—"}</td></tr>)}</tbody></table>
          ) : <p className="muted">Limited keyword evidence: nothing in the dataset matched this product.</p>
        ) : ev.serp.length ? (
          <>
            <p className="muted">
              {ev.patterns ? `${INTENT[ev.patterns.intent]} · ${ev.patterns.resultsAnalysed} relevant results analysed` : ""}
              {ev.patterns?.productNouns.length ? ` · Nouns used: ${ev.patterns.productNouns.map((n) => `${n.term} (${n.count})`).join(", ")}` : ""}
            </p>
            {ev.queries.map((q) => {
              const rows = ev.serp.filter((s) => s.query === q.query);
              return (
                <div key={q.query} style={{ marginBottom: 12 }}>
                  <strong>“{q.query}”</strong> <span className="muted">· {q.reason} · {rows[0]?.cached ? "cached, " : ""}checked {rows[0] ? new Date(rows[0].checkedAt).toLocaleDateString("en-AU") : "—"}</span>
                  <table><tbody>{rows.map((s) => <tr key={s.id}><td style={{ width: 28 }}>{s.rank}</td><td>{s.title}<br /><span className="muted">{s.domain} · {s.pageClass}</span></td></tr>)}</tbody></table>
                </div>
              );
            })}
          </>
        ) : <p className="muted">{ev.serpStatus === "unavailable" ? "Live search results were unavailable." : "No live searches were run."}</p>}
      </>)}

      {canFeedback && (
        <div style={{ marginTop: 20 }}>
          {sent ? <p><strong>{sent}</strong></p> : (<>
            <div className="btns">
              <button onClick={() => feedback("used")}>Use this name</button>
              <button className="ghost" onClick={() => { setEditing(true); setEdited(title); }}>I edited it</button>
              <button className="ghost" onClick={() => feedback("rejected")}>Not suitable</button>
            </div>
            {editing && (<>
              <label>Final title</label><input value={edited} onChange={(e) => setEdited(e.target.value)} maxLength={200} />
              <label>Why? (optional)</label><input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />
              <p><button disabled={!edited.trim()} onClick={() => feedback("edited")}>Save edit</button></p>
            </>)}
            {err && <p className="err">{err}</p>}
          </>)}
        </div>
      )}
      {isAdmin && gen.usage != null && <details style={{ marginTop: 12 }}><summary className="muted">Admin: usage</summary><pre style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(gen.usage, null, 1)}</pre></details>}
    </div>
  );
}
