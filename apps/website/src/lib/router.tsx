import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type AnchorHTMLAttributes,
  type MouseEvent,
  type ReactNode,
} from "react";

/**
 * A deliberately tiny History-API router.
 *
 * The site grew from one anchor-linked page into several real pages (home,
 * rental, fleet software…). That needs real URLs — for SEO, for sharing, for
 * the back button — but not a routing library: there are no nested layouts, no
 * loaders, no params. Adding react-router would also change the pnpm lockfile
 * that the Render build installs with `--frozen-lockfile`.
 *
 * What it does:
 *   - tracks `pathname` / `search` / `hash` and re-renders on back/forward and
 *     on in-page `#hash` clicks (plain `<a href="#x">` keeps working);
 *   - `<Link>` intercepts ordinary left-clicks on same-site URLs and pushes
 *     history instead of reloading; modified clicks, `target`, `download` and
 *     external URLs fall through to the browser untouched;
 *   - after a pathname change it scrolls to the `#hash` target, or to the top.
 */

export interface RouterLocation {
  pathname: string;
  search: string;
  hash: string;
}

/** `/fleet-management/` and `/fleet-management` are the same page. */
export function normalizePath(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith("/")) return pathname.slice(0, -1);
  return pathname || "/";
}

/**
 * The URL form every page is published under: "/about" becomes "/about/".
 * Hash and query are kept; files ("/privacy.html") and the root are untouched.
 */
export function withTrailingSlash(to: string): string {
  const m = /^([^?#]*)(.*)$/.exec(to);
  const path = m?.[1] ?? to;
  const rest = m?.[2] ?? "";
  if (!path.startsWith("/") || path === "/" || path.endsWith("/") || /\.[a-z0-9]+$/i.test(path)) return to;
  return `${path}/${rest}`;
}

function readLocation(ssrUrl?: string): RouterLocation {
  if (typeof window === "undefined") {
    // Build-time render (scripts/prerender.mjs): there is no window, so the page's URL is passed in.
    const u = new URL(ssrUrl ?? "/", "http://localhost");
    return { pathname: normalizePath(u.pathname), search: u.search, hash: u.hash };
  }
  return {
    pathname: normalizePath(window.location.pathname),
    search: window.location.search,
    hash: window.location.hash,
  };
}

interface RouterContextValue {
  location: RouterLocation;
  navigate: (to: string, options?: { replace?: boolean }) => void;
}

const RouterContext = createContext<RouterContextValue | null>(null);

/**
 * The old single-page site used `/#pricing`, `/#how-it-works` etc. Those
 * sections now live on the rental page. Anyone arriving on a bookmarked or
 * shared old anchor link is sent to the section's new home instead of being
 * dropped at the top of the hub.
 */
const LEGACY_RENTAL_ANCHORS = new Set([
  "#how-it-works",
  "#why",
  "#pricing",
  "#battery-swap",
  "#faq",
  "#get-app",
  "#showcase",
]);

/** True when this is an old `/#pricing`-style link that will be redirected to the rental page. */
export function isLegacyRentalUrl(): boolean {
  return resolveLegacyUrl() !== null;
}

function resolveLegacyUrl(): string | null {
  if (typeof window === "undefined") return null;
  const { pathname, hash, search } = window.location;
  if (normalizePath(pathname) === "/" && LEGACY_RENTAL_ANCHORS.has(hash)) {
    return `/ev-scooter-rental/${search}${hash}`;
  }
  return null;
}

export function Router({ children, url }: { children: ReactNode; url?: string }) {
  const [location, setLocation] = useState<RouterLocation>(() => {
    const legacy = resolveLegacyUrl();
    if (legacy) window.history.replaceState(window.history.state, "", legacy);
    return readLocation(url);
  });

  useEffect(() => {
    const sync = () => setLocation(readLocation());
    window.addEventListener("popstate", sync);
    window.addEventListener("hashchange", sync);
    return () => {
      window.removeEventListener("popstate", sync);
      window.removeEventListener("hashchange", sync);
    };
  }, []);

  const navigate = useCallback((to: string, options?: { replace?: boolean }) => {
    const url = new URL(to, window.location.href);
    if (url.origin !== window.location.origin) {
      window.location.assign(to);
      return;
    }
    const next = `${url.pathname}${url.search}${url.hash}`;
    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (next !== current) {
      if (options?.replace) window.history.replaceState(null, "", next);
      else window.history.pushState(null, "", next);
    }
    setLocation(readLocation());
    // A click on a link to where you already are still scrolls — it is how a
    // visitor returns to the top of the page they are on.
    if (next === current) scrollToTarget(url.hash);
  }, []);

  const value = useMemo(() => ({ location, navigate }), [location, navigate]);

  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>;
}

export function useRouter(): RouterContextValue {
  const ctx = useContext(RouterContext);
  if (!ctx) throw new Error("useRouter must be used inside <Router>");
  return ctx;
}

export function useLocation(): RouterLocation {
  return useRouter().location;
}

function scrollToTarget(hash: string): boolean {
  if (hash.length > 1) {
    const el = document.getElementById(decodeURIComponent(hash.slice(1)));
    if (el) {
      el.scrollIntoView();
      return true;
    }
  }
  window.scrollTo({ top: 0, left: 0, behavior: "instant" as ScrollBehavior });
  return hash.length > 1;
}

/**
 * Scrolls after the route's content has painted. A hash target does not exist
 * until the new page has rendered, and lazy pages render a tick later still,
 * so it retries briefly before giving up.
 */
export function ScrollManager() {
  const { location } = useRouter();

  useLayoutEffect(() => {
    if ("scrollRestoration" in window.history) window.history.scrollRestoration = "manual";
  }, []);

  useEffect(() => {
    const { hash } = location;
    if (hash.length <= 1) {
      window.scrollTo({ top: 0, left: 0, behavior: "instant" as ScrollBehavior });
      return;
    }
    const id = decodeURIComponent(hash.slice(1));
    let tries = 0;
    let timer: number;
    const settleTimers: number[] = [];

    // Content above the target (images, sections that fill in from the API) can
    // still change height after the first scroll and push the target off screen.
    // So re-align a couple of times, unless the visitor has already started
    // scrolling themselves, in which case their position wins.
    let interacted = false;
    const markInteracted = () => {
      interacted = true;
    };
    const interactionEvents = ["wheel", "touchstart", "keydown", "mousedown"] as const;
    interactionEvents.forEach((e) => window.addEventListener(e, markInteracted, { passive: true, once: true }));

    const attempt = () => {
      const el = document.getElementById(id);
      if (el) {
        el.scrollIntoView();
        for (const ms of [400, 1200]) {
          settleTimers.push(
            window.setTimeout(() => {
              if (!interacted) document.getElementById(id)?.scrollIntoView();
            }, ms),
          );
        }
      } else if (tries++ < 20) {
        timer = window.setTimeout(attempt, 60);
      }
    };
    attempt();
    return () => {
      window.clearTimeout(timer);
      settleTimers.forEach((t) => window.clearTimeout(t));
      interactionEvents.forEach((e) => window.removeEventListener(e, markInteracted));
    };
    // Only a pathname change should reset scroll. A hash-only change is
    // handled natively by the browser (scroll-padding included).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  return null;
}

type LinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  to: string;
};

/**
 * Internal navigation. Renders a real `<a href>` so crawlers, middle-click and
 * "copy link" all work; only a plain left-click is taken over.
 */
export function Link({ to, onClick, target, children, ...rest }: LinkProps) {
  const { navigate } = useRouter();

  const href = withTrailingSlash(to);

  const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (e.defaultPrevented) return;
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (target && target !== "_self") return;
    if (rest.download !== undefined) return;

    const url = new URL(href, window.location.href);
    if (url.origin !== window.location.origin) return;
    // Hash-only link on the current page: let the browser scroll (it honours
    // scroll-padding-top and updates the URL natively).
    if (
      normalizePath(url.pathname) === normalizePath(window.location.pathname) &&
      url.search === window.location.search &&
      url.hash
    ) {
      return;
    }
    e.preventDefault();
    navigate(href);
  };

  return (
    <a href={href} target={target} onClick={handleClick} {...rest}>
      {children}
    </a>
  );
}
