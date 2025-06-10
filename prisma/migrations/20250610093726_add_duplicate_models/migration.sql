-- CreateTable
CREATE TABLE "DuplicateGroup" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "rule" TEXT NOT NULL,
    "productIds" TEXT NOT NULL,
    "similarity" REAL,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "resolvedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ProductBackup" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productData" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ScanSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "totalProducts" INTEGER NOT NULL DEFAULT 0,
    "scannedProducts" INTEGER NOT NULL DEFAULT 0,
    "duplicatesFound" INTEGER NOT NULL DEFAULT 0,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    "errorMessage" TEXT
);

-- CreateTable
CREATE TABLE "DuplicateStats" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "byTitle" INTEGER NOT NULL DEFAULT 0,
    "bySku" INTEGER NOT NULL DEFAULT 0,
    "byBarcode" INTEGER NOT NULL DEFAULT 0,
    "byTitleSku" INTEGER NOT NULL DEFAULT 0,
    "byTitleBarcode" INTEGER NOT NULL DEFAULT 0,
    "bySkuBarcode" INTEGER NOT NULL DEFAULT 0,
    "lastScanAt" DATETIME,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "DuplicateGroup_shop_resolved_idx" ON "DuplicateGroup"("shop", "resolved");

-- CreateIndex
CREATE INDEX "DuplicateGroup_shop_rule_idx" ON "DuplicateGroup"("shop", "rule");

-- CreateIndex
CREATE INDEX "ProductBackup_shop_productId_idx" ON "ProductBackup"("shop", "productId");

-- CreateIndex
CREATE INDEX "ScanSession_shop_status_idx" ON "ScanSession"("shop", "status");

-- CreateIndex
CREATE UNIQUE INDEX "DuplicateStats_shop_key" ON "DuplicateStats"("shop");
