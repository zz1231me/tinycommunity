import FingerprintJS from '@fingerprintjs/fingerprintjs';

let visitorId: string | null = null;

export async function getVisitorId(): Promise<string> {
  if (visitorId) return visitorId;
  try {
    const fp = await FingerprintJS.load();
    const result = await fp.get();
    visitorId = result.visitorId;
    return visitorId;
  } catch {
    return '';
  }
}
