type PersistedLogoPayload = {
  dataUrl: string;
  name: string;
  type: string;
  lastModified: number;
};

export type PersistedLogo = {
  dataUrl: string;
  file: File;
};

function canUseStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function parsePersistedLogo(rawValue: string | null): PersistedLogoPayload | null {
  if (!rawValue) return null;

  try {
    const parsed = JSON.parse(rawValue) as Partial<PersistedLogoPayload>;
    if (
      typeof parsed.dataUrl !== 'string' ||
      typeof parsed.name !== 'string' ||
      typeof parsed.type !== 'string'
    ) {
      return null;
    }

    return {
      dataUrl: parsed.dataUrl,
      name: parsed.name,
      type: parsed.type,
      lastModified: typeof parsed.lastModified === 'number' ? parsed.lastModified : Date.now(),
    };
  } catch {
    return null;
  }
}

function dataUrlToFile(dataUrl: string, fileName: string, mimeType: string, lastModified: number) {
  const parts = dataUrl.split(',');
  if (parts.length < 2) return null;

  try {
    const binary = window.atob(parts[1]);
    const bytes = new Uint8Array(binary.length);

    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }

    return new File([bytes], fileName, {
      type: mimeType || 'application/octet-stream',
      lastModified,
    });
  } catch {
    return null;
  }
}

export function loadPersistedLogo(storageKey: string): PersistedLogo | null {
  if (!canUseStorage()) return null;

  const payload = parsePersistedLogo(window.localStorage.getItem(storageKey));
  if (!payload) return null;

  const file = dataUrlToFile(payload.dataUrl, payload.name, payload.type, payload.lastModified);
  if (!file) return null;

  return {
    dataUrl: payload.dataUrl,
    file,
  };
}

export function savePersistedLogo(storageKey: string, file: File, dataUrl: string) {
  if (!canUseStorage()) return;

  window.localStorage.setItem(storageKey, JSON.stringify({
    dataUrl,
    name: file.name,
    type: file.type,
    lastModified: file.lastModified,
  }));
}

export function clearPersistedLogo(storageKey: string) {
  if (!canUseStorage()) return;
  window.localStorage.removeItem(storageKey);
}
