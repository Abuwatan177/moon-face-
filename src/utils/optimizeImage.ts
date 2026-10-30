const WEBP_QUALITY = 1;

export function optimizeImage(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d');
      if (!context) {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('Could not create image canvas'));
        return;
      }

      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        URL.revokeObjectURL(objectUrl);
        if (!blob || blob.type !== 'image/webp') {
          reject(new Error('Could not encode image as WebP'));
          return;
        }
        resolve(blob);
      }, 'image/webp', WEBP_QUALITY);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Could not decode image'));
    };
    image.src = objectUrl;
  });
}