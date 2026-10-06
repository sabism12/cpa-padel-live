import React, { useEffect, useRef } from 'react';

interface StickyHeroProps {
  children: React.ReactNode;
  /** Classes for the inner section (padding, alignment). */
  className?: string;
  id?: string;
}

/**
 * Page hero headline that scrolls up with the page until it reaches the top,
 * then stays pinned while the next element (a card, a grid…) scrolls over it.
 * As that element covers the headline, the headline fades out and shrinks a
 * little; scrolling back up brings it back.
 *
 * Pinning uses native CSS `position: sticky`, handled by the browser on its
 * own scrolling thread, so it never lags or jitters (including iPhone Safari).
 * JavaScript only drives the fade/shrink, at most once per frame, written
 * straight to the element with no React re-render.
 *
 * The element directly AFTER this one in the page is what covers the hero, so
 * it must sit above it: give it `relative z-10`.
 */
export const StickyHero: React.FC<StickyHeroProps> = ({ children, className = '', id }) => {
  const pinRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    let frame = 0;

    const update = () => {
      frame = 0;
      const pin = pinRef.current;
      const hero = heroRef.current;
      const cover = pin?.nextElementSibling as HTMLElement | null;
      if (!pin || !hero) return;
      if (!cover) {
        hero.style.opacity = '1';
        hero.style.transform = '';
        hero.style.visibility = 'visible';
        return;
      }
      const height = Math.max(1, pin.offsetHeight);
      const coverTop = cover.getBoundingClientRect().top;
      // 0 while the covering element is below the headline, 1 once it covers it.
      const progress = Math.min(1, Math.max(0, (height - coverTop) / height));
      hero.style.opacity = String(1 - progress);
      hero.style.transform = reduceMotion ? '' : `scale(${1 - progress * 0.08})`;
      hero.style.visibility = progress >= 1 ? 'hidden' : 'visible';
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };

    update();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    // Webfonts change the headline height once they load.
    document.fonts?.ready.then(update).catch(() => undefined);
    return () => {
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    // pointer-events-none: the (possibly invisible) headline never blocks taps.
    <div ref={pinRef} className="sticky top-0 z-0 pointer-events-none">
      <section
        ref={heroRef}
        id={id}
        className={`origin-top will-change-[opacity,transform] ${className}`}
      >
        {children}
      </section>
    </div>
  );
};
