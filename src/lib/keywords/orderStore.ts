import type { Prisma } from "@prisma/client";
import { db } from "../db";
import { OrderAccumulator, type OrderModel } from "./orderModel";

/** The dataset's learned order model. Built at import; datasets imported before that get it built once, on demand. */
export async function getOrderModel(datasetId: string): Promise<OrderModel | null> {
  const ds = await db.keywordDataset.findUnique({ where: { id: datasetId }, select: { validationSummary: true } });
  const summary = (ds?.validationSummary ?? {}) as Record<string, unknown>;
  if (summary.orderModel) return summary.orderModel as OrderModel;

  const acc = new OrderAccumulator();
  let cursor: string | undefined;
  for (;;) {
    const rows = await db.keyword.findMany({
      where: { datasetId }, take: 5000, orderBy: { id: "asc" },
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      select: { id: true, normalizedKeyword: true, category: true, searchVolume: true },
    });
    if (!rows.length) break;
    for (const r of rows) acc.add(r.normalizedKeyword, r.category, r.searchVolume);
    cursor = rows[rows.length - 1].id;
  }
  const model = acc.finalize();
  await db.keywordDataset.update({ where: { id: datasetId }, data: { validationSummary: { ...summary, orderModel: model } as unknown as Prisma.InputJsonValue } });
  return model;
}
