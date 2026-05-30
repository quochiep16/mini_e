export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

export function calcShippingFee(distanceKm: number, subtotal: number): number {
  if (subtotal >= 500000) {
    return 0;
  }

  let fee = 0;

  if (distanceKm <= 3) fee = 0;
  else if (distanceKm <= 20) fee = 10000;
  else if (distanceKm <= 50) fee = 20000;
  else if (distanceKm <= 200) fee = 30000;
  else fee = 40000;

  return fee;
}