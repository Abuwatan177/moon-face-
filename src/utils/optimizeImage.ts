const MAX_DIMENSION = 1000;
const MAX_OUTPUT_BYTES = 180 * 1024;
const FIRST_QUALITY = 0.78;
const RETRY_QUALITY = 0.68;

export async function smartCompressToWebP(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not create image canvas');

    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const encode = (quality: number) => new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/webp', quality);
    });
    const firstPass = await encode(FIRST_QUALITY);
    if (!firstPass || firstPass.type !== 'image/webp') throw new Error('Could not encode image as WebP');
    if (firstPass.size <= MAX_OUTPUT_BYTES) return firstPass;

    const secondPass = await encode(RETRY_QUALITY);
    if (!secondPass || secondPass.type !== 'image/webp') throw new Error('Could not encode image as WebP');
    return secondPass;
  } finally {
    bitmap.close();
  }
}

export const optimizeImage = smartCompressToWebP;