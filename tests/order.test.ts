import { describe, expect, it } from "vitest";
import { OrderAccumulator, inversions, orderTokens } from "@/lib/keywords/orderModel";

function model() {
  const a = new OrderAccumulator();
  const add = (k: string, n = 12, cat = "Dresses") => { for (let i = 0; i < n; i++) a.add(`${k} ${i}`.replace(/ \d+$/, ""), cat, 100); };
  // colours lead; material before slip/subtype; length late
  add("black satin slip dress"); add("red satin slip dress"); add("black midi dress"); add("satin midi dress");
  add("black satin midi dress"); add("floral midi dress"); add("black floral dress");
  return a.finalize();
}

describe("learned attribute order", () => {
  it("orders the buyer's words by what the keyword list shows", () => {
    const m = model();
    expect(orderTokens(m, "Dresses", ["slip", "midi", "satin", "black"])).toEqual(["black", "satin", "slip", "midi"]);
    const o = orderTokens(m, "Dresses", ["midi", "satin", "black"]);
    expect(o).toEqual(["black", "satin", "midi"]);
  });
  it("counts inversions against the learned order, ignores unknown ties", () => {
    const m = model();
    expect(inversions(m, "Dresses", ["black", "satin", "midi"])).toBe(0);
    expect(inversions(m, "Dresses", ["midi", "satin", "black"])).toBeGreaterThan(0);
  });
  it("falls back to class defaults with no model (colour first, length late)", () => {
    expect(orderTokens(null, null, ["midi", "black"])).toEqual(["black", "midi"]);
  });
});
