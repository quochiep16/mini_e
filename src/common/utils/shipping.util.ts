export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371; // km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function calcShippingFee(distanceKm: number, subtotal: number) {
  if (subtotal >= 500_000) return 0;
  if (distanceKm <= 20) return 10_000;
  if (distanceKm <= 50) return 20_000;
  if (distanceKm <= 200) return 30_000;
  return 40_000;
}
