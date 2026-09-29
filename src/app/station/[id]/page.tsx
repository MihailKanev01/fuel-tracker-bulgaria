import type { Metadata } from "next";
import { FuelType } from "@prisma/client";
import { notFound } from "next/navigation";
import { getStationDetail } from "@/lib/station";
import { StationPage } from "@/components/station-page";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const aliases: Record<string, FuelType> = {
  diesel: "DIESEL",
  a95: "GASOLINE_95",
  a100: "GASOLINE_100",
  lpg: "LPG",
  cng: "CNG",
};

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ fuel?: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const query = await searchParams;
  const fuel = aliases[(query.fuel ?? "diesel").toLowerCase()] ?? "DIESEL";
  const station = await getStationDetail(id, fuel);

  return {
    title: station ? `${station.brand ?? station.name} · ${station.fuelLabel} · Fuel Tracker Bulgaria` : "Станция · Fuel Tracker Bulgaria",
    description: station
      ? `Текуща цена, история и източник за ${station.brand ?? station.name} в ${station.city}.`
      : "Информация за бензиностанция и история на цените.",
  };
}

export default async function StationRoute({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ fuel?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const fuel = aliases[(query.fuel ?? "diesel").toLowerCase()] ?? "DIESEL";
  const station = await getStationDetail(id, fuel);

  if (!station) notFound();

  return <StationPage station={station} />;
}
