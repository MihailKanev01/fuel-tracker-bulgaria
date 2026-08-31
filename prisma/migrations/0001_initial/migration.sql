-- Initial transparent fuel-price data model.
CREATE TYPE "FuelType" AS ENUM ('DIESEL', 'GASOLINE_95', 'GASOLINE_100', 'LPG', 'CNG');
CREATE TYPE "SourceKind" AS ENUM ('API', 'OFFICIAL_SITE', 'STRUCTURED_ENDPOINT', 'HTML_PUBLIC');
CREATE TYPE "SourceStatus" AS ENUM ('ONLINE', 'DEGRADED', 'ERROR', 'DISABLED');
CREATE TYPE "AlertKind" AS ENUM ('PRICE_BELOW', 'PRICE_CHANGE', 'STATION', 'REGION', 'MARKET');

CREATE TABLE "Station" (
  "id" TEXT NOT NULL, "name" TEXT NOT NULL, "brand" TEXT, "address" TEXT NOT NULL, "city" TEXT NOT NULL, "region" TEXT,
  "latitude" DECIMAL(9,6), "longitude" DECIMAL(9,6), "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Station_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Source" (
  "id" TEXT NOT NULL, "name" TEXT NOT NULL, "kind" "SourceKind" NOT NULL, "baseUrl" TEXT NOT NULL,
  "status" "SourceStatus" NOT NULL DEFAULT 'DISABLED', "reliability" INTEGER NOT NULL DEFAULT 50, "lastAttemptAt" TIMESTAMP(3),
  "lastSuccessAt" TIMESTAMP(3), "recordsSeen" INTEGER NOT NULL DEFAULT 0, "errorMessage" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Source_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Price" (
  "id" TEXT NOT NULL, "stationId" TEXT NOT NULL, "sourceId" TEXT NOT NULL, "fuelType" "FuelType" NOT NULL,
  "priceEur" DECIMAL(6,3) NOT NULL, "observedAt" TIMESTAMP(3) NOT NULL, "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "originalPrice" DECIMAL(7,3), "originalCurrency" TEXT, "originalUrl" TEXT NOT NULL, "confidence" INTEGER NOT NULL,
  "anomaly" BOOLEAN NOT NULL DEFAULT false, "anomalyReason" TEXT, CONSTRAINT "Price_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "PriceChange" (
  "id" TEXT NOT NULL, "stationId" TEXT NOT NULL, "fuelType" "FuelType" NOT NULL, "oldPriceEur" DECIMAL(6,3) NOT NULL,
  "newPriceEur" DECIMAL(6,3) NOT NULL, "changeEur" DECIMAL(6,3) NOT NULL, "changePercent" DECIMAL(7,3) NOT NULL,
  "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "sourceUrl" TEXT NOT NULL, CONSTRAINT "PriceChange_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "FetchRun" (
  "id" TEXT NOT NULL, "sourceId" TEXT NOT NULL, "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3), "recordsFetched" INTEGER NOT NULL DEFAULT 0, "accepted" INTEGER NOT NULL DEFAULT 0,
  "rejected" INTEGER NOT NULL DEFAULT 0, "errorMessage" TEXT, CONSTRAINT "FetchRun_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "NewsItem" (
  "id" TEXT NOT NULL, "title" TEXT NOT NULL, "url" TEXT NOT NULL, "publisher" TEXT NOT NULL, "publishedAt" TIMESTAMP(3) NOT NULL,
  "summary" TEXT, "impact" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "NewsItem_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "MarketDatum" (
  "id" TEXT NOT NULL, "metric" TEXT NOT NULL, "value" DECIMAL(12,4) NOT NULL, "unit" TEXT NOT NULL,
  "observedAt" TIMESTAMP(3) NOT NULL, "sourceUrl" TEXT NOT NULL, CONSTRAINT "MarketDatum_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Alert" (
  "id" TEXT NOT NULL, "userKey" TEXT NOT NULL, "kind" "AlertKind" NOT NULL, "fuelType" "FuelType" NOT NULL DEFAULT 'DIESEL',
  "threshold" DECIMAL(7,3), "stationId" TEXT, "city" TEXT, "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "Alert_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Station_name_address_city_key" ON "Station"("name", "address", "city");
CREATE INDEX "Station_city_brand_idx" ON "Station"("city", "brand");
CREATE UNIQUE INDEX "Source_name_key" ON "Source"("name");
CREATE INDEX "Price_fuelType_observedAt_idx" ON "Price"("fuelType", "observedAt");
CREATE INDEX "Price_stationId_fuelType_observedAt_idx" ON "Price"("stationId", "fuelType", "observedAt");
CREATE INDEX "PriceChange_detectedAt_idx" ON "PriceChange"("detectedAt");
CREATE UNIQUE INDEX "NewsItem_url_key" ON "NewsItem"("url");
CREATE UNIQUE INDEX "MarketDatum_metric_observedAt_key" ON "MarketDatum"("metric", "observedAt");

ALTER TABLE "Price" ADD CONSTRAINT "Price_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "Station"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Price" ADD CONSTRAINT "Price_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PriceChange" ADD CONSTRAINT "PriceChange_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "Station"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FetchRun" ADD CONSTRAINT "FetchRun_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source"("id") ON DELETE CASCADE ON UPDATE CASCADE;
