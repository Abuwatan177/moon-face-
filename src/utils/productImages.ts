export function getProductImageUrl(value: unknown): string {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return '';

  const image = value as { finalUrl?: unknown; previewUrl?: unknown };
  if (typeof image.finalUrl === 'string' && image.finalUrl) return image.finalUrl;
  return typeof image.previewUrl === 'string' ? image.previewUrl : '';
}

export function getProductImageUrls(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(getProductImageUrl).filter(Boolean);
}

export function getFinalProductImageUrl(value: unknown): string {
  const url = typeof value === 'string'
    ? value
    : value && typeof value === 'object' && typeof (value as { finalUrl?: unknown }).finalUrl === 'string'
      ? (value as { finalUrl: string }).finalUrl
      : '';
  return url.startsWith('blob:') || url.startsWith('data:') ? '' : url;
}

export function getFinalProductImageUrls(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(getFinalProductImageUrl).filter(Boolean);
}