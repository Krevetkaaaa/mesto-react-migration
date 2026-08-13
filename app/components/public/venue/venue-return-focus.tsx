import { useEffect } from "react";
import { useInRouterContext, useLocation } from "react-router";

export type VenueInvoker =
  | { readonly surface: "catalog"; readonly venueKey: string; readonly action: "title" | "action" }
  | { readonly surface: "home"; readonly venueKey: string; readonly action: "overlay" };

type VenueReturnFocus = VenueInvoker
  | { readonly surface: "catalog" | "home"; readonly action: "fallback" };

const FOCUSABLE_INVOKER_SELECTOR = "[data-venue-focus-surface][data-venue-focus-key][data-venue-focus-action]";
const FALLBACK_IDS = {
  catalog: "catalog-title",
  home: "guide-title",
} as const;

interface VenueLinkActivation {
  readonly altKey: boolean;
  readonly button: number;
  readonly ctrlKey: boolean;
  readonly currentTarget: HTMLAnchorElement;
  readonly defaultPrevented: boolean;
  readonly metaKey: boolean;
  readonly shiftKey: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isVenueKey(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(value);
}

function parseInvoker(value: unknown): VenueInvoker | null {
  if (!isRecord(value) || !isVenueKey(value.venueKey)) return null;
  if (value.surface === "catalog" && (value.action === "title" || value.action === "action")) {
    return { surface: "catalog", venueKey: value.venueKey, action: value.action };
  }
  if (value.surface === "home" && value.action === "overlay") {
    return { surface: "home", venueKey: value.venueKey, action: "overlay" };
  }
  return null;
}

function parseReturnFocus(value: unknown): VenueReturnFocus | null {
  const invoker = parseInvoker(value);
  if (invoker) return invoker;
  if (isRecord(value) && value.action === "fallback" && (value.surface === "catalog" || value.surface === "home")) {
    return { surface: value.surface, action: "fallback" };
  }
  return null;
}

export function venueInvokerNavigationState(invoker: VenueInvoker) {
  return { venueInvoker: invoker } as const;
}

export function venueReturnNavigationState(locationState: unknown, returnPath: string) {
  const returnState = isRecord(locationState) ? { ...locationState } : {};
  const invoker = parseInvoker(returnState.venueInvoker);
  delete returnState.venueInvoker;
  delete returnState.venueReturnFocus;
  const fallbackSurface = returnPath === "/" ? "home" : "catalog";
  return {
    ...returnState,
    venueReturnFocus: invoker ?? { surface: fallbackSurface, action: "fallback" as const },
  } as const;
}

export function venueFocusData(invoker: VenueInvoker) {
  return {
    "data-venue-focus-surface": invoker.surface,
    "data-venue-focus-key": invoker.venueKey,
    "data-venue-focus-action": invoker.action,
  } as const;
}

export function armVenueReturnFocus(event: VenueLinkActivation, invoker: VenueInvoker) {
  if (event.defaultPrevented
    || event.button !== 0
    || event.metaKey
    || event.ctrlKey
    || event.shiftKey
    || event.altKey
    || event.currentTarget.hasAttribute("download")
    || (event.currentTarget.target && event.currentTarget.target !== "_self")) return;

  const historyState: unknown = window.history.state;
  const preservedHistoryState = isRecord(historyState) ? historyState : {};
  const userState = isRecord(preservedHistoryState.usr) ? preservedHistoryState.usr : {};
  window.history.replaceState({
    ...preservedHistoryState,
    usr: { ...userState, venueReturnFocus: invoker },
  }, "");
}

function focusFallback(surface: VenueReturnFocus["surface"]) {
  const fallback = document.getElementById(FALLBACK_IDS[surface]);
  if (!(fallback instanceof HTMLElement)) return;
  const hadTabIndex = fallback.hasAttribute("tabindex");
  if (!hadTabIndex) fallback.tabIndex = -1;
  fallback.focus();
  if (!hadTabIndex) fallback.removeAttribute("tabindex");
}

function consumeBrowserReturnFocusState() {
  const historyState: unknown = window.history.state;
  if (!isRecord(historyState) || !isRecord(historyState.usr) || !("venueReturnFocus" in historyState.usr)) return;
  const remainingUserState = { ...historyState.usr };
  delete remainingUserState.venueReturnFocus;
  window.history.replaceState({
    ...historyState,
    usr: Object.keys(remainingUserState).length ? remainingUserState : null,
  }, "");
}

function RoutedVenueReturnFocusRestorer({ surface }: { surface: VenueReturnFocus["surface"] }) {
  const location = useLocation();

  useEffect(() => {
    const state = isRecord(location.state) ? parseReturnFocus(location.state.venueReturnFocus) : null;
    if (!state || state.surface !== surface) return;

    const frame = window.requestAnimationFrame(() => {
      if (state.action !== "fallback") {
        const target = Array.from(document.querySelectorAll<HTMLElement>(FOCUSABLE_INVOKER_SELECTOR))
          .find((element) => element.dataset.venueFocusSurface === state.surface
            && element.dataset.venueFocusKey === state.venueKey
            && element.dataset.venueFocusAction === state.action);
        if (target) {
          target.focus();
          if (document.activeElement === target) {
            consumeBrowserReturnFocusState();
            return;
          }
        }
      }
      focusFallback(surface);
      consumeBrowserReturnFocusState();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [location.key, location.state, surface]);

  return null;
}

export function VenueReturnFocusRestorer({ surface }: { surface: VenueReturnFocus["surface"] }) {
  const inRouter = useInRouterContext();
  return inRouter ? <RoutedVenueReturnFocusRestorer surface={surface} /> : null;
}
