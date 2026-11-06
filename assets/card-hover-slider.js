/**
 * Zorelle: keeps product card carousels in step with the hover image.
 *
 * While a card is hovered, its second image fades in over the first (CSS overlay),
 * but the carousel underneath is still on slide 1. On the first arrow click of a hover:
 *   - next     -> jump straight to slide 3 (slide 2 is already showing)
 *   - previous -> show slide 1 by hiding the overlay
 * After that the arrows behave normally. Leaving the card resets to slide 1.
 * Applies to card galleries marked [data-hover-second-slide] (snippets/card-gallery.liquid).
 */

const GALLERY = '.card-gallery[data-hover-second-slide]';

/** @param {Element} gallery */
function isOverlayShowing(gallery) {
  // Only the first arrow click of a hover is remapped; after that the slider runs normally.
  return gallery.hasAttribute('data-hovered') && !gallery.hasAttribute('data-hover-engaged');
}

// Registered on window (capture) so it runs before the theme's own delegated
// arrow handler on document and can stop it for the remapped first click.
window.addEventListener(
  'click',
  (event) => {
    if (!(event.target instanceof Element)) return;
    const arrow = event.target.closest('.slideshow-control--next, .slideshow-control--previous');
    const gallery = arrow?.closest(GALLERY);
    if (!arrow || !gallery || !isOverlayShowing(gallery)) return;

    const slideshow = gallery.querySelector('slideshow-component');
    if (!slideshow || typeof slideshow.select !== 'function') return;

    event.preventDefault();
    event.stopImmediatePropagation();
    // Marks the first click as used and hides the overlay instantly (see card-gallery.liquid).
    gallery.setAttribute('data-hover-engaged', '');

    if (arrow.classList.contains('slideshow-control--next')) {
      // Count slides from the markup; visibleSlides depends on what is on screen.
      const slideCount = gallery.querySelectorAll('slideshow-slide:not([hidden])').length;
      // With only two images, "next" after image 2 wraps back to image 1.
      // With only two images, "next" after image 2 wraps back to image 1 (the overlay just hides).
      if (slideCount > 2) slideshow.select(2, event);
    }
    // "previous": slide 1 is already underneath, hiding the overlay reveals it.
  },
  { capture: true }
);

document.addEventListener(
  'pointerover',
  (event) => {
    if (!(event.target instanceof Element) || event.pointerType !== 'mouse') return;
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
