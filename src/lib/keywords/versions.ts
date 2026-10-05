import { db } from "../db";

export class DatasetError extends Error {}

/** Make a ready/archived dataset the brand's active one. The previous active becomes archived (kept for rollback). */
export async function activateDataset(datasetId: string, actorId?: string | null) {
  return db.$transaction(async (tx) => {
    const ds = await tx.keywordDataset.findUnique({ where: { id: datasetId }, include: { brand: true } });
    if (!ds) throw new DatasetError("Dataset not found");
    if (!["ready", "archived"].includes(ds.status)) throw new DatasetError(`A ${ds.status} dataset can't be activated`);

    const previousId = ds.brand.activeKeywordDatasetId;
    if (previousId && previousId !== ds.id) {
      await tx.keywordDataset.update({ where: { id: previousId }, data: { status: "archived" } });
    }
    await tx.keywordDataset.update({ where: { id: ds.id }, data: { status: "active", activatedAt: new Date() } });
    await tx.brand.update({ where: { id: ds.brandId }, data: { activeKeywordDatasetId: ds.id } });
    await tx.auditEvent.create({
      data: {
        brandId: ds.brandId,
        userId: actorId ?? null,
        eventType: previousId && ds.activatedAt ? "dataset.rolled_back" : "dataset.activated",
        targetType: "dataset",
        targetId: ds.id,
        metadata: { previousDatasetId: previousId },
      },
    });
    return ds.id;
  });
}

export async function activeDatasetId(brandId: string) {
  const b = await db.brand.findUnique({ where: { id: brandId }, select: { activeKeywordDatasetId: true } });
  return b?.activeKeywordDatasetId ?? null;
}
