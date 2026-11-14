const MAX_DIMENSION = 1000;
const MAX_OUTPUT_BYTES = 180 * 1024;
const FIRST_QUALITY = 0.78;
const RETRY_QUALITY = 0.68;

export function isImageFile(file: File) {
  return file.type.startsWith('image/') || /\.(?:jpe?g|png|gif|webp|avif|bmp|heic|heif|tiff?)$/i.test(file.name);
}

async function loadImage(file: File) {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file);
      return {
        source: bitmap as CanvasImageSource,
        width: bitmap.width,
        height: bitmap.height,
        close: () => bitmap.close(),
      };
    } catch {
      // Some mobile browsers cannot decode every image format through createImageBitmap.
    }
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = objectUrl;
    if (typeof image.decode === 'function') {
      try {
        await image.decode();
      } catch {
        if (!image.complete) {
          await new Promise<void>((resolve, reject) => {
            image.onload = () => resolve();
            image.onerror = () => reject(new Error('تعذر فتح الصورة. اختر صورة بصيغة JPG أو PNG أو HEIC.'));
          });
        }
      }
    } else if (!image.complete) {
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error('تعذر فتح الصورة. اختر صورة بصيغة JPG أو PNG أو HEIC.'));
      });
    }
    if (!image.naturalWidth || !image.naturalHeight) throw new Error('تعذر قراءة أبعاد الصورة.');
    return {
      source: image as CanvasImageSource,
      width: image.naturalWidth,
      height: image.naturalHeight,
      close: () => URL.revokeObjectURL(objectUrl),
    };
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw new Error('تعذر فتح الصورة على هذا الجهاز. جرّب حفظها بصيغة JPG أو PNG ثم أعد رفعها.', { cause: error });
  }
}

export async function optimizeImageForUpload(file: File): Promise<Blob> {
  if (!isImageFile(file)) throw new Error('الملف المحدد ليس صورة.');
  const image = await loadImage(file);
  try {
    const scale = Math.min(1, MAX_DIMENSION / Math.max(image.width, image.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('تعذر تجهيز الصورة على هذا الجهاز.');

    context.drawImage(image.source, 0, 0, canvas.width, canvas.height);
    const encode = (quality: number) => new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/webp', quality);
    });
    const firstPass = await encode(FIRST_QUALITY);
    if (firstPass?.type === 'image/webp' && firstPass.size <= MAX_OUTPUT_BYTES) return firstPass;

    if (firstPass?.type === 'image/webp') {
      const secondPass = await encode(RETRY_QUALITY);
      if (secondPass?.type === 'image/webp') return secondPass;
    }

    const fallback = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/png');
    });
    if (!fallback || fallback.type !== 'image/png') throw new Error('تعذر تجهيز الصورة على هذا الجهاز.');
    return fallback;
  } finally {
    image.close();
  }
}

export const smartCompressToWebP = optimizeImageForUpload;
export const optimizeImage = optimizeImageForUpload;