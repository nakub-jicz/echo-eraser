-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_DuplicateStats" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "byTitle" INTEGER NOT NULL DEFAULT 0,
    "bySku" INTEGER NOT NULL DEFAULT 0,
    "byBarcode" INTEGER NOT NULL DEFAULT 0,
    "byTitleSku" INTEGER NOT NULL DEFAULT 0,
    "byTitleBarcode" INTEGER NOT NULL DEFAULT 0,
    "bySkuBarcode" INTEGER NOT NULL DEFAULT 0,
    "totalProductsScanned" INTEGER NOT NULL DEFAULT 0,
    "lastScanAt" DATETIME,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_DuplicateStats" ("byBarcode", "bySku", "bySkuBarcode", "byTitle", "byTitleBarcode", "byTitleSku", "id", "lastScanAt", "shop", "updatedAt") SELECT "byBarcode", "bySku", "bySkuBarcode", "byTitle", "byTitleBarcode", "byTitleSku", "id", "lastScanAt", "shop", "updatedAt" FROM "DuplicateStats";
DROP TABLE "DuplicateStats";
ALTER TABLE "new_DuplicateStats" RENAME TO "DuplicateStats";
CREATE UNIQUE INDEX "DuplicateStats_shop_key" ON "DuplicateStats"("shop");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
