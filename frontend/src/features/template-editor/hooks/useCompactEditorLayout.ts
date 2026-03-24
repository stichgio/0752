import { useSyncExternalStore } from 'react';

/** Viewport estrecho: paneles laterales como overlay (Tailwind lg = 1024px). */
const MEDIA = '(max-width: 1023px)';

function subscribe(onChange: () => void) {
  const mq = window.matchMedia(MEDIA);
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
}

function getSnapshot() {
  return window.matchMedia(MEDIA).matches;
}

function getServerSnapshot() {
  return false;
}

export function useCompactEditorLayout(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
