import { prisma } from "@/lib/prisma";

const asNumber = (value: { toNumber(): number } | null) => value?.toNumber() ?? null;

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const earthRadiusKm = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export async function nearbyDiesel(
  latitude: number,
  longitude: number,
  radiusKm = 25,
  limit = 10,
) {
  const stations = await prisma.station.findMany({
    where: { active: true },
    include: {
      prices: {
        where: { fuelType: "DIESEL", anomaly: false },
        orderBy: { observedAt: "desc" },
        take: 1,
      },
    },
  });

  return stations
    .flatMap((station) => {
      const stationLat = asNumber(station.latitude);
      const stationLon = asNumber(station.longitude);
      const price = station.prices[0];

      if (stationLat == null || stationLon == null || !price) return [];

      const distanceKm = haversineKm(
        latitude,
        longitude,
        stationLat,
        stationLon,
      );

      if (distanceKm > radiusKm) return [];

      return [{
        id: station.id,
        name: station.name,
        brand: station.brand,
        city: station.city,
        address: station.address,
        price: price.priceEur.toNumber(),
        observedAt: price.observedAt,
        confidence: price.confidence,
        sourceUrl: price.originalUrl,
        latitude: stationLat,
        longitude: stationLon,
        distanceKm: Number(distanceKm.toFixed(2)),
      }];
    })
    .sort((a, b) => a.price - b.price || a.distanceKm - b.distanceKm)
    .slice(0, limit);
}
