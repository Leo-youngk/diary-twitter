export interface CompressOptions {
  maxWidth: number;
  maxKB: number;
}

export const AVATAR_OPTS: CompressOptions = { maxWidth: 400, maxKB: 200 };
export const BANNER_OPTS: CompressOptions = { maxWidth: 1200, maxKB: 500 };
export const POST_IMAGE_OPTS: CompressOptions = { maxWidth: 1600, maxKB: 400 };

// Scale down and re-encode as a base64 JPEG data URL. Data URLs survive reloads
// and sync to KV as plain text — object URLs do neither.
export function compressImage(file: File, { maxWidth, maxKB }: CompressOptions): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      let { width, height } = img;
      if (width > maxWidth) {
        height = Math.round(height * (maxWidth / width));
        width = maxWidth;
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas 2D context unavailable'));
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);

      // 1.37 ≈ base64 expansion factor, so the budget applies to decoded bytes.
      let quality = 0.85;
      let result = canvas.toDataURL('image/jpeg', quality);
      while (result.length > maxKB * 1024 * 1.37 && quality > 0.1) {
        quality -= 0.1;
        result = canvas.toDataURL('image/jpeg', quality);
      }
      resolve(result);
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to decode image'));
    };

    img.src = url;
  });
}
