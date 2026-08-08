import { useEffect } from "react";

const MOTION_QUERIES = ".section-heading, .app-promo-copy, .app-phones, .newsletter, .place-stats, .platform, .site-footer";
const CARD_MOTION_QUERIES = ".category-card, .venue-card, .collection-card, .city-card, .how-grid article";

interface PhoneDemo {
  readonly image: string;
  readonly title: string;
  readonly meta: string;
  readonly rating: string;
}

const PHONE_DEMOS: readonly PhoneDemo[] = [
  { image: "assets/venue-restaurant-unsplash.jpg", title: "Баркас", meta: "Ресторан · Симферополь", rating: "4.9" },
  { image: "assets/venue-cocktail-unsplash.jpg", title: "Gio", meta: "Бар · Ялта", rating: "4.8" },
  { image: "assets/venue-cafe-unsplash.jpg", title: "Утро", meta: "Кафе · у моря", rating: "4.9" },
];

function setUpRevealMotion(scope: HTMLElement, reducedMotion: boolean) {
  if (reducedMotion || !("IntersectionObserver" in window)) return () => undefined;
  document.body.classList.add("motion-ready");
  const observed: HTMLElement[] = [];
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("is-revealed");
      observer.unobserve(entry.target);
    });
  }, { threshold: 0.12, rootMargin: "0px 0px -42px" });

  scope.querySelectorAll<HTMLElement>(MOTION_QUERIES).forEach((target) => {
    target.classList.add("motion-reveal");
    observed.push(target);
    observer.observe(target);
  });
  scope.querySelectorAll<HTMLElement>(CARD_MOTION_QUERIES).forEach((card) => {
    const group = card.closest(".category-grid, .venue-grid, .collection-grid, .city-list, .how-grid");
    const groupIndex = group ? Array.from(group.querySelectorAll(":scope > *")).indexOf(card) : 0;
    card.style.setProperty("--motion-delay", `${Math.min(Math.max(groupIndex, 0), 7) * 45}ms`);
    card.classList.add("motion-item");
    observed.push(card);
    observer.observe(card);
  });

  return () => {
    observer.disconnect();
    observed.forEach((target) => {
      target.classList.remove("motion-reveal", "motion-item", "is-revealed");
      target.style.removeProperty("--motion-delay");
    });
    document.body.classList.remove("motion-ready");
  };
}

function setUpTilt(stage: HTMLElement, reducedMotion: boolean) {
  if (reducedMotion || !window.matchMedia("(hover:hover) and (pointer:fine)").matches) return () => undefined;
  let frame = 0;
  const onPointerMove = (event: PointerEvent) => {
    if (frame) return;
    frame = window.requestAnimationFrame(() => {
      const rect = stage.getBoundingClientRect();
      const x = Math.max(-1, Math.min(1, ((event.clientX - rect.left) / rect.width - 0.5) * 2));
      const y = Math.max(-1, Math.min(1, ((event.clientY - rect.top) / rect.height - 0.5) * 2));
      stage.style.setProperty("--promo-x", `${(x * 2.6).toFixed(2)}deg`);
      stage.style.setProperty("--promo-y", `${(y * -2).toFixed(2)}deg`);
      frame = 0;
    });
  };
  const resetTilt = () => {
    if (frame) window.cancelAnimationFrame(frame);
    frame = 0;
    stage.style.setProperty("--promo-x", "0deg");
    stage.style.setProperty("--promo-y", "0deg");
  };
  stage.addEventListener("pointermove", onPointerMove, { passive: true });
  stage.addEventListener("pointerleave", resetTilt);
  return () => {
    stage.removeEventListener("pointermove", onPointerMove);
    stage.removeEventListener("pointerleave", resetTilt);
    resetTilt();
  };
}

function setUpPhoneDemo(stage: HTMLElement, reducedMotion: boolean) {
  const featured = stage.querySelector<HTMLElement>("[data-phone-featured]");
  const image = featured?.querySelector<HTMLImageElement>("[data-phone-featured-image]");
  const title = featured?.querySelector<HTMLElement>("[data-phone-featured-title]");
  const meta = featured?.querySelector<HTMLElement>("[data-phone-featured-meta]");
  const rating = featured?.querySelector<HTMLElement>("[data-phone-featured-rating]");
  const toggle = stage.querySelector<HTMLButtonElement>("[data-phone-demo-toggle]");
  const icon = toggle?.querySelector<HTMLElement>("[data-phone-demo-icon]");
  if (!featured || !image || !title || !meta || !rating || !toggle || !icon) return () => undefined;

  PHONE_DEMOS.slice(1).forEach((demo) => {
    const preload = new Image();
    preload.src = demo.image;
  });

  let index = 0;
  let interval = 0;
  let swapTimer = 0;
  let focusTimer = 0;
  let manualPause = false;
  let interactionPause = false;
  let sceneVisible = true;
  let sceneObserver: IntersectionObserver | null = null;

  const stop = () => {
    if (interval) window.clearInterval(interval);
    interval = 0;
  };
  const showNext = () => {
    featured.classList.add("is-swapping");
    window.clearTimeout(swapTimer);
    swapTimer = window.setTimeout(() => {
      index = (index + 1) % PHONE_DEMOS.length;
      const demo = PHONE_DEMOS[index];
      if (!demo) return;
      image.src = demo.image;
      title.textContent = demo.title;
      meta.textContent = demo.meta;
      rating.textContent = demo.rating;
      featured.classList.remove("is-swapping");
    }, 190);
  };
  const schedule = () => {
    stop();
    if (manualPause || interactionPause || !sceneVisible || document.hidden || reducedMotion) return;
    interval = window.setInterval(showNext, 4_400);
  };
  const syncToggle = () => {
    toggle.setAttribute("aria-pressed", String(manualPause));
    toggle.setAttribute("aria-label", manualPause ? "Продолжить анимацию макетов" : "Приостановить анимацию макетов");
    icon.textContent = manualPause ? "▶" : "Ⅱ";
    stage.classList.toggle("is-demo-paused", manualPause);
  };
  const onPointerEnter = () => {
    interactionPause = true;
    stop();
  };
  const onPointerLeave = () => {
    interactionPause = false;
    schedule();
  };
  const onFocusIn = () => {
    interactionPause = true;
    stop();
  };
  const onFocusOut = () => {
    window.clearTimeout(focusTimer);
    focusTimer = window.setTimeout(() => {
      interactionPause = stage.contains(document.activeElement);
      schedule();
    });
  };
  const onToggle = () => {
    manualPause = !manualPause;
    syncToggle();
    schedule();
  };

  if (reducedMotion) {
    toggle.hidden = true;
  } else {
    stage.addEventListener("pointerenter", onPointerEnter, { passive: true });
    stage.addEventListener("pointerleave", onPointerLeave, { passive: true });
    stage.addEventListener("focusin", onFocusIn);
    stage.addEventListener("focusout", onFocusOut);
    toggle.addEventListener("click", onToggle);
    document.addEventListener("visibilitychange", schedule);
    if ("IntersectionObserver" in window) {
      sceneObserver = new IntersectionObserver(([entry]) => {
        sceneVisible = Boolean(entry?.isIntersecting);
        schedule();
      }, { rootMargin: "160px 0px" });
      sceneObserver.observe(stage);
    }
    syncToggle();
    schedule();
  }

  return () => {
    stop();
    window.clearTimeout(swapTimer);
    window.clearTimeout(focusTimer);
    sceneObserver?.disconnect();
    stage.removeEventListener("pointerenter", onPointerEnter);
    stage.removeEventListener("pointerleave", onPointerLeave);
    stage.removeEventListener("focusin", onFocusIn);
    stage.removeEventListener("focusout", onFocusOut);
    toggle.removeEventListener("click", onToggle);
    document.removeEventListener("visibilitychange", schedule);
    featured.classList.remove("is-swapping");
    stage.classList.remove("is-demo-paused");
    toggle.hidden = false;
  };
}

export function HomePresentationEffects({ enabled }: { enabled: boolean }) {
  useEffect(() => {
    if (!enabled) return;
    const scope = document.querySelector<HTMLElement>('main[data-react-route="home"]');
    const stage = scope?.querySelector<HTMLElement>("[data-tilt-stage]");
    if (!scope || !stage) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const cleanUpMotion = setUpRevealMotion(scope, reducedMotion);
    const cleanUpTilt = setUpTilt(stage, reducedMotion);
    const cleanUpPhoneDemo = setUpPhoneDemo(stage, reducedMotion);
    return () => {
      cleanUpPhoneDemo();
      cleanUpTilt();
      cleanUpMotion();
    };
  }, [enabled]);

  return null;
}
