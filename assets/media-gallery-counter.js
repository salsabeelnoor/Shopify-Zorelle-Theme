/**
 * Zorelle: keeps the product gallery's "1 / 3" counter (snippets/product-media-gallery-content.liquid)
 * in step with the slideshow. Listens once on the document, so it keeps working after the
 * section re-renders (e.g. on variant change), and syncs on load because the slideshow can
 * start on a variant's image instead of the first one.
 */

const COUNTER = '.media-gallery__counter [data-media-counter-current]';

/** @param {Element} slideshow */
function sync(slideshow) {
  const current = slideshow.querySelector(COUNTER);
  if (!current) return;
  const index = /** @type {{ current?: number }} */ (slideshow).current;
  if (typeof index === 'number') current.textContent = String(index + 1);
}

document.addEventListener('slideshow:select', (event) => {
  if (!(event.target instanceof Element)) return;
  const slideshow = event.target.closest('slideshow-component');
  const current = slideshow?.querySelector(COUNTER);
  if (!current) return;
  const index = /** @type {CustomEvent<{ index?: number }>} */ (event).detail?.index;
  if (typeof index === 'number') current.textContent = String(index + 1);
});

customElements.whenDefined('slideshow-component').then(() => {
  for (const counter of document.querySelectorAll(COUNTER)) {
    const slideshow = counter.closest('slideshow-component');
    if (slideshow) sync(slideshow);
  }
});
