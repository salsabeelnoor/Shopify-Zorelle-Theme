/**
 * Zorelle: keeps product card carousels in step with the hover image.
 *
 * While a card is hovered, its second image fades in over the first (CSS overlay),
 * but the carousel underneath is still on slide 1. On the first arrow click of a hover
 * the carousel jumps instantly (no animation) to slide 2, which looks identical to the
 * overlay, and the overlay is hidden. The click then continues to the theme's own
 * arrow handler, so next/previous slide from image 2 with the normal animation:
 *   - next     -> slides to image 3 (or wraps to image 1 when there are only two)
 *   - previous -> slides back to image 1
 * Leaving the card resets to slide 1.
 * Applies to card galleries marked [data-hover-second-slide] (snippets/card-gallery.liquid).
 */

const GALLERY = '.card-gallery[data-hover-second-slide]';

// Must match the hover-image media query in snippets/card-gallery.liquid.
const HOVER_IMAGE_QUERY = window.matchMedia('(hover: hover) and (pointer: fine) and (min-width: 750px)');

/** @param {Element} gallery */
function isOverlayShowing(gallery) {
  // Only the first arrow click of a hover is remapped; after that the slider runs normally.
  return gallery.hasAttribute('data-hovered') && !gallery.hasAttribute('data-hover-engaged');
}

// Registered on window (capture) so it runs before the theme's own delegated arrow
// handler; it only lines the carousel up and lets the click through.
window.addEventListener(
  'click',
  (event) => {
    if (!(event.target instanceof Element)) return;
    const arrow = event.target.closest('.slideshow-control--next, .slideshow-control--previous');
    const gallery = arrow?.closest(GALLERY);
    if (!arrow || !gallery || !isOverlayShowing(gallery)) return;

    const slideshow = gallery.querySelector('slideshow-component');
    if (!slideshow || typeof slideshow.select !== 'function') return;

    // Instant select runs synchronously, so the theme's handler below already sees slide 2.
    slideshow.select(1, undefined, { animate: false });
    // Marks the first click as used and hides the overlay instantly (see card-gallery.liquid).
    gallery.setAttribute('data-hover-engaged', '');
  },
  { capture: true }
);

document.addEventListener(
  'pointerover',
  (event) => {
    if (!(event.target instanceof Element) || event.pointerType !== 'mouse' || !HOVER_IMAGE_QUERY.matches) return;
    event.target.closest(GALLERY)?.setAttribute('data-hovered', '');
  },
  { passive: true }
);

document.addEventListener(
  'pointerout',
  (event) => {
    if (!(event.target instanceof Element)) return;
    const gallery = event.target.closest(GALLERY);
    if (!gallery) return;
    const next = event.relatedTarget;
    if (next instanceof Node && gallery.contains(next)) return;
    gallery.removeAttribute('data-hover-engaged');
    gallery.removeAttribute('data-hovered');

    // Return to the first image so the next hover starts from image 2 again.
    const slideshow = gallery.querySelector('slideshow-component');
    if (slideshow && typeof slideshow.select === 'function' && slideshow.current !== 0) {
      slideshow.select(0, undefined, { animate: false });
    }
  },
  { passive: true }
);
