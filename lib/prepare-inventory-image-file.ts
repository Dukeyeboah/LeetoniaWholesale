/**
 * Normalize inventory image picks (including iPhone HEIC) for upload and preview.
 * HEIC is converted to JPEG in the browser so Storage + storefront img tags work everywhere.
 */

const ALLOWED_EXTENSIONS = [
  'jpg',
  'jpeg',
  'png',
  'gif',
  'webp',
  'heic',
  'heif',
] as const;

export const INVENTORY_IMAGE_ACCEPT =
  'image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif,.heic,.heif';

export function isHeicFile(file: File): boolean {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  return (
    ext === 'heic' ||
    ext === 'heif' ||
    file.type === 'image/heic' ||
    file.type === 'image/heif'
  );
}

export function isAllowedInventoryImageFile(file: File): boolean {
  if (isHeicFile(file)) return true;
  if (file.type.startsWith('image/')) return true;
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  return (ALLOWED_EXTENSIONS as readonly string[]).includes(ext);
}

export function inventoryImageExtension(file: File): string {
  const rawExt = (file.name.split('.').pop() || 'jpg')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  if (rawExt === 'jpeg') return 'jpg';
  if (['jpg', 'png', 'gif', 'webp'].includes(rawExt)) return rawExt;
  return 'jpg';
}

export function inventoryImageContentType(extension: string): string {
  switch (extension) {
    case 'png':
      return 'image/png';
    case 'gif':
      return 'image/gif';
    case 'webp':
      return 'image/webp';
    default:
      return 'image/jpeg';
  }
}

export type PreparedInventoryImage = {
  file: File;
  previewDataUrl: string;
  convertedFromHeic: boolean;
};

/** Read file as data URL for preview (non-HEIC). */
function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/**
 * Accept HEIC/HEIF from the gallery; convert to JPEG before upload/preview.
 */
export async function prepareInventoryImageFile(
  file: File
): Promise<PreparedInventoryImage> {
  if (isHeicFile(file)) {
    const { default: heic2any } = await import('heic2any');
    const result = await heic2any({
      blob: file,
      toType: 'image/jpeg',
      quality: 0.92,
    });
    const blob = Array.isArray(result) ? result[0] : result;
    const baseName = file.name.replace(/\.(heic|heif)$/i, '') || 'image';
    const jpegFile = new File([blob], `${baseName}.jpg`, {
      type: 'image/jpeg',
      lastModified: file.lastModified,
    });
    const previewDataUrl = await readFileAsDataUrl(jpegFile);
    return {
      file: jpegFile,
      previewDataUrl,
      convertedFromHeic: true,
    };
  }

  const previewDataUrl = await readFileAsDataUrl(file);
  return {
    file,
    previewDataUrl,
    convertedFromHeic: false,
  };
}
