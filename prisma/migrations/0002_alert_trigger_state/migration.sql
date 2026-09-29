ALTER TABLE "Alert" ADD COLUMN "lastTriggeredAt" TIMESTAMP(3);
ALTER TABLE "Alert" ADD COLUMN "lastTriggeredPrice" DECIMAL(7,3);

CREATE INDEX "Alert_userKey_active_idx" ON "Alert"("userKey", "active");
CREATE INDEX "Alert_stationId_fuelType_active_idx" ON "Alert"("stationId", "fuelType", "active");