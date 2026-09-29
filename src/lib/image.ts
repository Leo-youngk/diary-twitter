export interface CompressOptions {
  maxWidth: number;
  maxKB: number;
}

export const AVATAR_OPTS: CompressOptions = { maxWidth: 400, maxKB: 200 };
export const BANNER_OPTS: CompressOptions = { maxWidth: 1200, maxKB: 500 };
export const POST_IMAGE_OPTS: CompressOptions = { maxWidth: 1600, maxKB: 400 };

function toJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Failed to encode image'))), 'image/jpeg', quality);
  });
}

/** Scale down and re-encode as JPEG within a size budget. */
export async function compressImage(file: File, { maxWidth, maxKB }: CompressOptions): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new window.Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Failed to decode image'));
      image.src = url;
    });
    let { width, height } = img;
    if (width > maxWidth) {
      height = Math.round(height * (maxWidth / width));
      width = maxWidth;
    }
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable');
    ctx.drawImage(img, 0, 0, width, height);

    let quality = 0.85;
    let blob = await toJpeg(canvas, quality);
    while (blob.size > maxKB * 1024 && quality > 0.15) {
      quality -= 0.1;
      blob = await toJpeg(canvas, quality);
    }
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}
