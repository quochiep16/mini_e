export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371; // km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/** Rule bạn định nghĩa:
 * 0–3km: 0? (nội thành free nếu muốn) — nếu không muốn free thì set min theo nhóm dưới
 * 3–20km: 10k
 * 20–50km: 20k
 * 50–200km: 30k
 * >200km: 40k
 * Free ship khi tổng đơn > 500k (xử lý ở FE/hoặc trước khi tạo order nếu muốn)
 */
export function calcShippingFee(distanceKm: number, subtotal: number): number {
  let fee = 0;
  if (distanceKm <= 3) fee = 0;
  else if (distanceKm <= 20) fee = 10000;
  else if (distanceKm <= 50) fee = 20000;
  else if (distanceKm <= 200) fee = 30000;
  else fee = 40000;

  // Nếu muốn free ship >500k per-order, bật đoạn dưới:
  // if (subtotal >= 500000) return 0;

  return fee;
}
