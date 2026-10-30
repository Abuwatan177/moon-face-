const storeMediaPath = '/storage/v1/object/public/store-media/';
const convertibleImageExtension = /\.(?:jpe?g|png|gif|svg|avif|tiff?|bmp|heic|heif)(?=([?#]|$))/i;

export function toWebpStorageUrl(source: string) {
  if (!source.includes(storeMediaPath)) return source;
  return source.replace(convertibleImageExtension, '.webp');
}