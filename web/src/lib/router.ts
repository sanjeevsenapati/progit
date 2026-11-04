// Client-Side Router & Navigation Infrastructure for ProGit SPA

type NavigationListener = (path: string, search: string) => void;
const listeners = new Set<NavigationListener>();

type ProgressListener = (active: boolean) => void;
const progressListeners = new Set<ProgressListener>();

let progressTimer: ReturnType<typeof setTimeout> | null = null;

export function onNavigate(listener: NavigationListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function onProgress(listener: ProgressListener): () => void {
  progressListeners.add(listener);
  return () => {
    progressListeners.delete(listener);
  };
}

export function startProgress(): void {
  if (progressTimer) clearTimeout(progressTimer);
  progressListeners.forEach(fn => fn(true));
  progressTimer = setTimeout(() => {
    stopProgress();
  }, 350);
}

export function stopProgress(): void {
  if (progressTimer) clearTimeout(progressTimer);
  progressListeners.forEach(fn => fn(false));
}

export interface NavigateOptions {
  replace?: boolean;
  scroll?: boolean;
}

/**
 * Client-side programmatic navigation without full page reloads.
 */
export function navigate(to: string, options?: NavigateOptions): void {
  if (!to) return;

  const currentFull = window.location.pathname + window.location.search + window.location.hash;
  if (to === currentFull && !options?.replace) {
    if (options?.scroll !== false) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    return;
  }

  // Trigger top progress indicator
  startProgress();

  if (options?.replace) {
    window.history.replaceState(null, '', to);
  } else {
    window.history.pushState(null, '', to);
  }

  // Notify listeners immediately
  const pathname = window.location.pathname;
  const search = window.location.search;
  listeners.forEach(fn => fn(pathname, search));

  // Dispatch popstate for standard listeners
  window.dispatchEvent(new PopStateEvent('popstate'));

  if (options?.scroll !== false) {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  setTimeout(() => {
    stopProgress();
  }, 100);
}

let interceptorInitialized = false;

/**
 * Initializes global click interception for all internal links.
 * Any click on standard `<a href="...">` is captured and executed
 * as a seamless client-side SPA navigation unless modifier keys are pressed,
 * the link is external, target="_blank", or a file download/passthrough.
 */
export function initLinkInterceptor(): void {
  if (interceptorInitialized || typeof window === 'undefined') return;
  interceptorInitialized = true;

  document.addEventListener('click', (e: MouseEvent) => {
    // Only intercept primary left button click without modifier keys
    if (e.button !== 0 || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || e.defaultPrevented) {
      return;
    }

    const target = e.target as HTMLElement | null;
    if (!target) return;

    const anchor = target.closest('a') as HTMLAnchorElement | null;
    if (!anchor) return;

    // Skip if has target="_blank" or non-self targets
    if (anchor.target && anchor.target !== '_self') return;

    // Skip if has download attribute
    if (anchor.hasAttribute('download')) return;

    // Skip if rel="external"
    if (anchor.getAttribute('rel')?.includes('external')) return;

    const rawHref = anchor.getAttribute('href');
    if (!rawHref) return;

    // Skip hash links, mailto, tel, javascript
    if (
      rawHref.startsWith('#') ||
      rawHref.startsWith('mailto:') ||
      rawHref.startsWith('tel:') ||
      rawHref.startsWith('javascript:')
    ) {
      return;
    }

    // Check same origin
    const origin = window.location.origin;
    let url: URL;
    try {
      url = new URL(anchor.href, origin);
    } catch {
      return;
    }

    if (url.origin !== origin) return;

    const pathname = url.pathname;

    // Skip backend routes, static files, raw blobs, and Git operations
    if (
      pathname.startsWith('/api/') ||
      pathname.startsWith('/pages/') ||
      pathname.startsWith('/raw/') ||
      pathname.startsWith('/archive/') ||
      pathname.endsWith('.git') ||
      pathname.endsWith('.tar.gz') ||
      pathname.endsWith('.zip') ||
      pathname.endsWith('.patch')
    ) {
      return;
    }

    // Intercept and navigate via SPA without page refresh!
    e.preventDefault();
    const destination = url.pathname + url.search + url.hash;
    navigate(destination);
  });
}
