const NAVIGATION_EXIT_DELAY_MS = 140;
const HAS_VIEW_TRANSITIONS =
  typeof document !== 'undefined' && 'startViewTransition' in document;

function isPlainLeftClick(event) {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

function getNavigationUrl(event) {
  if (!isPlainLeftClick(event) || !(event.target instanceof Element)) {
    return null;
  }

  const anchor = event.target.closest('a[href]');

  if (!(anchor instanceof HTMLAnchorElement) || event.defaultPrevented) {
    return null;
  }

  if ((anchor.target && anchor.target !== '_self') || anchor.hasAttribute('download')) {
    return null;
  }

  if (anchor.dataset.noPageTransition === 'true') {
    return null;
  }

  const rel = anchor.getAttribute('rel') || '';
  if (/\bexternal\b/i.test(rel)) {
    return null;
  }

  const nextUrl = new URL(anchor.href, window.location.href);
  if (!/^https?:$/.test(nextUrl.protocol) || nextUrl.origin !== window.location.origin) {
    return null;
  }

  const isHashOnlyNavigation =
    nextUrl.pathname === window.location.pathname &&
    nextUrl.search === window.location.search &&
    nextUrl.hash !== window.location.hash;

  if (isHashOnlyNavigation) {
    return null;
  }

  const isSameDocumentNavigation =
    nextUrl.pathname === window.location.pathname &&
    nextUrl.search === window.location.search &&
    nextUrl.hash === window.location.hash;

  return isSameDocumentNavigation ? null : nextUrl;
}

function markPageReady() {
  const body = document.body;
  if (!body) {
    return;
  }

  body.classList.remove('page-shell-leaving');

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      body.classList.add('page-shell-ready');
    });
  });
}

// ---------------------------------------------------------------------------
// Link prefetching — preload pages on pointer hover for near-instant navigation
// ---------------------------------------------------------------------------
function setupLinkPrefetching() {
  const prefetched = new Set();

  document.addEventListener(
    'pointerenter',
    (event) => {
      if (!(event.target instanceof Element)) return;
      const anchor = event.target.closest('a[href]');
      if (!(anchor instanceof HTMLAnchorElement)) return;

      try {
        const url = new URL(anchor.href, window.location.href);
        if (url.origin !== window.location.origin) return;
        if (url.pathname === window.location.pathname) return;
        if (prefetched.has(url.pathname)) return;

        prefetched.add(url.pathname);
        const link = document.createElement('link');
        link.rel = 'prefetch';
        link.href = url.pathname;
        document.head.appendChild(link);
      } catch (_) {
        // ignore malformed URLs
      }
    },
    true,
  );
}

export function initializePageShell() {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }

  if (window.__pageShellInitialized) {
    if (!HAS_VIEW_TRANSITIONS) markPageReady();
    return;
  }

  window.__pageShellInitialized = true;

  if ('scrollRestoration' in window.history) {
    window.history.scrollRestoration = 'manual';
  }

  window.scrollTo(0, 0);

  // Always enable prefetching for faster navigation
  setupLinkPrefetching();

  // -----------------------------------------------------------------------
  // When the browser supports View Transitions (Chrome 111+), the CSS
  // @view-transition { navigation: auto } rule handles cross-document
  // animations automatically.  No manual exit animation is needed.
  // -----------------------------------------------------------------------
  if (HAS_VIEW_TRANSITIONS) {
    return;
  }

  // -----------------------------------------------------------------------
  // Fallback for browsers WITHOUT View Transitions API
  // -----------------------------------------------------------------------
  document.body.classList.remove('page-shell-ready', 'page-shell-leaving');

  document.addEventListener('click', (event) => {
    const nextUrl = getNavigationUrl(event);
    if (!nextUrl) {
      return;
    }

    event.preventDefault();
    document.body.classList.add('page-shell-leaving');
    window.setTimeout(() => {
      window.location.assign(nextUrl.toString());
    }, NAVIGATION_EXIT_DELAY_MS);
  });

  window.addEventListener('pageshow', () => {
    window.scrollTo(0, 0);
    markPageReady();
  });

  markPageReady();
}
