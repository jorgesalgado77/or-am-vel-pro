import { useMemo } from "react";
import { useApiKeys } from "@/hooks/useApiKeys";

/**
 * Returns the Google Maps API key for the current tenant (if configured).
 * Used for distance/KM calculations between client and technician addresses.
 */
export function useGoogleMapsKey(tenantId: string | null) {
  const { keys, loading } = useApiKeys(tenantId);

  const googleMapsKey = useMemo(() => {
    const entry = keys.find(k => k.provider === "google_maps" && k.is_active);
    return entry?.api_key || null;
  }, [keys]);

  return { googleMapsKey, loading };
}

/**
 * Calculate round-trip distance between two addresses using Google Maps Distance Matrix API.
 * Returns total KM (ida + volta) or null if unavailable.
 */
export async function calculateRoundTripKm(
  apiKey: string,
  originAddress: string,
  destinationAddress: string
): Promise<{ km: number; duration: string } | null> {
  if (!apiKey || !originAddress || !destinationAddress) return null;

  try {
    const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(originAddress)}&destinations=${encodeURIComponent(destinationAddress)}&key=${encodeURIComponent(apiKey)}&language=pt-BR`;

    const res = await fetch(url);
    if (!res.ok) return null;

    const data = await res.json();
    const element = data?.rows?.[0]?.elements?.[0];

    if (element?.status !== "OK") return null;

    const distanceMeters = element.distance.value;
    const durationText = element.duration.text;
    const oneWayKm = distanceMeters / 1000;
    const roundTripKm = Math.round(oneWayKm * 2 * 10) / 10;

    return { km: roundTripKm, duration: durationText };
  } catch {
    return null;
  }
}
