const recentlyViewedStorageKey = 'moon-face-recently-viewed-v1';
const recentlyViewedLimit = 5;

export function readRecentlyViewedProductIds(): number[] {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(recentlyViewedStorageKey) || '[]');
    if (!Array.isArray(stored)) return [];
    return [...new Set(stored.filter((id): id is number => Number.isSafeInteger(id) && id > 0))].slice(0, recentlyViewedLimit);
  } catch {
    return [];
  }
}

export function trackRecentlyViewedProduct(productId: number): number[] {
  const previous = readRecentlyViewedProductIds();
  if (!Number.isSafeInteger(productId) || productId <= 0) return previous;
  const next = [productId, ...previous.filter((id) => id !== productId)].slice(0, recentlyViewedLimit);
  try {
    localStorage.setItem(recentlyViewedStorageKey, JSON.stringify(next));
  } catch {
    return next;
  }
  return next;
}