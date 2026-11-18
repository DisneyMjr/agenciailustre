import { useEffect } from "react";

/** Native scrolling remains available; animation never gates content or controls. */
export function useAgencyMotion() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>(".agency-site");
    if (!root) return;
    const preference = matchMedia("(prefers-reduced-motion: reduce)");
    const seen = new WeakSet<Element>();
    const animations = new Set<Animation>();
    let frame = 0;
    const animate = (element: Element, delay = 0) => {
      if (preference.matches) return;
      const animation = element.animate(
        [
          { opacity: 0, transform: "translate3d(0,32px,0)" },
          { opacity: 1, transform: "translate3d(0,0,0)" },
        ],
        {
          duration: 720,
          delay,
          easing: "cubic-bezier(.23,1,.32,1)",
          fill: "backwards",
        },
      );
      animations.add(animation);
      animation.onfinish = () => animations.delete(animation);
    };
    const observer = new IntersectionObserver(
      (entries) => {
        let stagger = 0;
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          observer.unobserve(entry.target);
          // Never delay a keyboard focus landing on an element.
          if (!entry.target.contains(document.activeElement))
            animate(entry.target, (stagger++ % 3) * 65);
        }
      },
      { threshold: 0.08, rootMargin: "0px 0px -28px 0px" },
    );
    const discover = () =>
      root
        .querySelectorAll(
          ".il-about-art,.il-about-copy,.il-section-title,.il-service-card,.il-work-card,.il-process-grid > *,.il-cta-strip h2,.contact > *, .il-portfolio-empty",
        )
        .forEach((element) => {
          if (!seen.has(element)) {
            seen.add(element);
            observer.observe(element);
          }
        });
    discover();
    const mutation = new MutationObserver(discover);
    mutation.observe(root, { childList: true, subtree: true });
    const update = () => {
      frame = 0;
      const y = Math.max(0, scrollY);
      root.style.setProperty(
        "--il-progress",
        String(
          y / Math.max(1, document.documentElement.scrollHeight - innerHeight),
        ),
      );
      root.style.setProperty(
        "--il-parallax",
        preference.matches ? "0px" : `${Math.min(y, 900) * 0.055}px`,
      );
    };
    const scroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    const reduce = () => {
      if (preference.matches) {
        animations.forEach((a) => a.cancel());
        animations.clear();
      }
      update();
    };
    const focus = () => {
      animations.forEach((a) => a.cancel());
      animations.clear();
    };
    root.addEventListener("focusin", focus);
    window.addEventListener("scroll", scroll, { passive: true });
    window.addEventListener("resize", scroll, { passive: true });
    preference.addEventListener("change", reduce);
    root
      .querySelectorAll(".il-hero-intro,.il-focus-card,.il-hero h1")
      .forEach((el, i) => animate(el, i * 90));
    update();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      mutation.disconnect();
      animations.forEach((a) => a.cancel());
      window.removeEventListener("scroll", scroll);
      window.removeEventListener("resize", scroll);
      root.removeEventListener("focusin", focus);
      preference.removeEventListener("change", reduce);
    };
  }, []);
}
