import { supabase } from '@/lib/supabase';

const PUBLIC_MEDIA_MARKER = '/storage/v1/object/public/profile-media/';

export function getProfileMediaUrl(value: string): string {
  const markerIndex = value.indexOf(PUBLIC_MEDIA_MARKER);
  const path = markerIndex >= 0
    ? decodeURIComponent(value.slice(markerIndex + PUBLIC_MEDIA_MARKER.length))
    : value;

  return supabase.storage.from('profile-media').getPublicUrl(path).data.publicUrl;
}

export async function prepareImageForUpload(file: File): Promise<File> {
  const objectUrl = URL.createObjectURL(file);

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('unsupported-image'));
      element.src = objectUrl;
    });

    const canvas = document.createElement('canvas');
    const maxDimension = 2400;
    const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((result) => {
        if (result) resolve(result);
        else reject(new Error('image-conversion-failed'));
      }, 'image/jpeg', 0.9);
    });

    return new File([blob], `${file.name.replace(/\.[^/.]+$/, '')}.jpg`, {
      type: 'image/jpeg',
      lastModified: Date.now(),
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function parseMediaUrls(value: unknown): string[] {
  const parsed = parseJsonArray(value);
  return parsed.filter((item): item is string => typeof item === 'string' && item.length > 0);
}

export function parseJsonArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return [];

  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
