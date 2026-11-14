const MAX_DIMENSION = 1000;
const MAX_UNDECODED_IMAGE_BYTES = 4 * 1024 * 1024;

export function isImageFile(file: File) {
  return file.type.startsWith('image/') || /\.(?:jpe?g|jfif|png|apng|gif|webp|avif|bmp|dib|heic|heif|hif|tiff?|svg|ico|cur|jxl|psd|dng|cr2|nef|arw|raw|orf|rw2|pef|srw)$/i.test(file.name);
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
  let image: Awaited<ReturnType<typeof loadImage>>;
  try {
    image = await loadImage(file);
  } catch (error) {
    if (file.size > MAX_UNDECODED_IMAGE_BYTES) {
      throw new Error('هذا الجهاز لا يستطيع فتح صيغة الصورة المحددة وحجمها كبير. احفظها بصيغة JPG أو PNG ثم أعد رفعها.', { cause: error });
    }
    return new Blob([file], { type: file.type || 'application/octet-stream' });
  }
  try {
    const scale = Math.min(1, MAX_DIMENSION / Math.max(image.width, image.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('تعذر تجهيز الصورة على هذا الجهاز.');

    context.drawImage(image.source, 0, 0, canvas.width, canvas.height);
    const fallback = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/png');
    });
    if (!fallback || fallback.type !== 'image/png') throw new Error('تعذر تجهيز الصورة على هذا الجهاز.');
    return fallback;
  } finally {
    image.close();
  }
}

export const optimizeImage = optimizeImageForUpload;