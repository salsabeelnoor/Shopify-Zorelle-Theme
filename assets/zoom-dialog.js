import { Component } from '@theme/component';
import { preloadImage, lockScroll, unlockScroll } from '@theme/utilities';
import { ZoomMediaSelectedEvent } from '@theme/events';
import { DialogCloseEvent } from '@theme/dialog';

/**
 * Zorelle full-screen image viewer for the product gallery.
 *
 * Shows one media item at a time with a "n / N" counter, previous / next buttons
 * (wrapping), keyboard arrows and Escape. Clicking (or tapping) an image zooms it in;
 * while zoomed, moving the mouse (or dragging a finger) pans to inspect the image.
 *
 * Keeps Horizon's zoom-dialog public API (`open(index, event)`, `loadHighResolutionImage`,
 * `refs.media`, `ZoomMediaSelectedEvent`) so media-gallery.js keeps working.
 *
 * @typedef {object} Refs
 * @property {HTMLDialogElement} dialog - The dialog element.
 * @property {HTMLElement[]} media - One slide per media item.
 * @property {HTMLElement} [counter] - The current-index number in the counter.
 * @property {HTMLElement} [status] - Visually hidden live region announcing the slide.
 *
 * @extends Component<Refs>
 */
export class ZoomDialog extends Component {
  requiredRefs = ['dialog', 'media'];

  /** How far a click zooms in. */
  static ZOOM_SCALE = 2.5;

  /** Pointer travel (px) after which a press counts as a drag, not a tap. */
  static TAP_TOLERANCE = 8;

  #index = 0;

  #isOpen = false;

  #highResImagesLoaded = /** @type {Set<string>} */ (new Set());

  /** @type {AbortController | undefined} */
  #controller;

  /** @type {{ x: number, y: number, moved: boolean, id: number } | null} */
  #press = null;

  connectedCallback() {
    super.connectedCallback();

    this.#controller?.abort();
    this.#controller = new AbortController();
    const { signal } = this.#controller;
    const { dialog } = this.refs;

    dialog.addEventListener('pointerdown', this.#handlePointerDown, { signal });
    dialog.addEventListener('pointermove', this.#handlePointerMove, { signal });
    dialog.addEventListener('pointerup', this.#handlePointerUp, { signal });
    dialog.addEventListener('pointercancel', this.#handlePointerCancel, { signal });
    // A native listener: declarative on:click re-targets event.target to the dialog.
    dialog.addEventListener('click', this.#handleBackdropClick, { signal });
    // Native close (for example the browser's own Escape handling) must still reset state.
    dialog.addEventListener('close', this.#handleClosed, { signal });
  }

  disconnectedCallback() {
    super.disconnectedCallback();

    this.#controller?.abort();
    unlockScroll(this);
  }

  /**
   * Opens the viewer at a media item.
   *
   * @param {number} index - The index of the media to show.
   * @param {Event} [event] - The triggering event.
   */
  open(index, event) {
    event?.preventDefault();

    const { dialog } = this.refs;

    this.show(Number(index) || 0);

    if (!dialog.open) {
      dialog.showModal();
      lockScroll(this);
      this.#isOpen = true;
    }
  }

  /** Closes the viewer. */
  close() {
    const { dialog } = this.refs;
    if (!dialog.open) return;

    dialog.close();
    // The native close event is queued, so clean up now rather than wait for it.
    this.#handleClosed();
  }

  /** Shows the previous media item (wraps to the last). */
  previous() {
    this.show(this.#index - 1);
  }

  /** Shows the next media item (wraps to the first). */
  next() {
    this.show(this.#index + 1);
  }

  /**
   * Shows a media item and keeps the counter, live region and gallery in step.
   *
   * @param {number} index - The index to show; out-of-range values wrap.
   */
  show(index) {
    const { media, counter, status } = this.refs;
    const count = media.length;
    if (!count) return;

    const nextIndex = ((index % count) + count) % count;
    const changed = nextIndex !== this.#index;
    this.#index = nextIndex;

    for (const [i, slide] of media.entries()) {
      const active = i === nextIndex;
      slide.toggleAttribute('data-active', active);
      slide.setAttribute('aria-hidden', `${!active}`);
      slide.inert = !active;
      if (active) continue;

      this.#resetZoom(slide);
      // Pause videos that are no longer showing.
      for (const video of slide.querySelectorAll('video')) video.pause();
    }

    if (counter) counter.textContent = `${nextIndex + 1}`;
    if (status && changed) status.textContent = status.dataset.template?.replace('[index]', `${nextIndex + 1}`) ?? '';

    const activeSlide = media[nextIndex];
    if (activeSlide) this.loadHighResolutionImage(activeSlide);

    // Warm up the neighbours so arrow navigation feels instant.
    const after = media[(nextIndex + 1) % count];
    if (after && count > 1) this.loadHighResolutionImage(after);

    this.dispatchEvent(new ZoomMediaSelectedEvent(nextIndex));
  }

  /**
   * Loads a high-resolution image for a media slide.
   *
   * @param {HTMLElement} mediaContainer - The media slide.
   */
  loadHighResolutionImage(mediaContainer) {
    if (!mediaContainer.classList.contains('product-media-container--image')) return false;

    const image = mediaContainer.querySelector('img.product-media__image');
    if (!(image instanceof HTMLImageElement)) return false;

    const highResolutionUrl = image.getAttribute('data_max_resolution');
    if (!highResolutionUrl || this.#highResImagesLoaded.has(highResolutionUrl)) return false;

    this.#highResImagesLoaded.add(highResolutionUrl);
    preloadImage(highResolutionUrl);

    const newImage = new Image();
    newImage.className = image.className;
    newImage.alt = image.alt;
    newImage.draggable = false;
    newImage.setAttribute('data_max_resolution', highResolutionUrl);
    newImage.setAttribute('ref', 'image');
    newImage.onload = () => image.replaceWith(newImage);
    newImage.onerror = () => this.#highResImagesLoaded.delete(highResolutionUrl);
    newImage.src = highResolutionUrl;

    return true;
  }

  /**
   * Keyboard: Escape closes, arrow keys change the image (mirrored in RTL).
   *
   * @param {KeyboardEvent} event - The keyboard event.
   */
  handleKeyDown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.close();
      return;
    }

    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    if (this.refs.media.length < 2) return;

    event.preventDefault();
    const rtl = getComputedStyle(this).direction === 'rtl';
    const forward = (event.key === 'ArrowRight') !== rtl;
    if (forward) this.next();
    else this.previous();
  }

  /**
   * Closes the viewer when the dark area around the image is clicked.
   *
   * @param {MouseEvent} event - The click event.
   */
  #handleBackdropClick = (event) => {
    if (!(event.target instanceof Element)) return;
    if (event.target.closest('[data-zoom-frame], button, a, video, iframe, model-viewer, deferred-media')) return;

    this.close();
  };

  /** Runs once per close, from close() or the native close event (whichever is first). */
  #handleClosed = () => {
    if (!this.#isOpen) return;
    this.#isOpen = false;

    unlockScroll(this);
    for (const slide of this.refs.media) this.#resetZoom(slide);
    for (const video of this.refs.dialog.querySelectorAll('video')) video.pause();
    window.dispatchEvent(new DialogCloseEvent());
  };

  /**
   * @param {PointerEvent} event
   * @returns {HTMLElement | null} The zoom frame under the pointer, if any.
   */
  #frameFrom(event) {
    if (!(event.target instanceof Element)) return null;
    const frame = event.target.closest('[data-zoom-frame]');
    return frame instanceof HTMLElement ? frame : null;
  }

  /** @param {PointerEvent} event */
  #handlePointerDown = (event) => {
    if (event.button !== 0 || !this.#frameFrom(event)) return;
    this.#press = { x: event.clientX, y: event.clientY, moved: false, id: event.pointerId };
  };

  /** @param {PointerEvent} event */
  #handlePointerMove = (event) => {
    const frame = this.#frameFrom(event);
    const press = this.#press;

    if (press && press.id === event.pointerId) {
      const distance = Math.hypot(event.clientX - press.x, event.clientY - press.y);
      if (distance > ZoomDialog.TAP_TOLERANCE) press.moved = true;
    }

    if (!frame || !frame.hasAttribute('data-zoomed')) return;

    // Mouse pans by hovering; touch and pen pan while pressed.
    if (event.pointerType !== 'mouse' && !press) return;

    this.#setOrigin(frame, event);
  };

  /** @param {PointerEvent} event */
  #handlePointerUp = (event) => {
    const press = this.#press;
    this.#press = null;
    if (!press || press.id !== event.pointerId || press.moved) return;

    const frame = this.#frameFrom(event);
    if (!frame) return;

    if (frame.hasAttribute('data-zoomed')) {
      this.#resetZoom(frame);
    } else {
      this.#setOrigin(frame, event);
      frame.setAttribute('data-zoomed', '');
    }
  };

  #handlePointerCancel = () => {
    this.#press = null;
  };

  /**
   * Points the zoom at the pointer position inside the frame.
   *
   * @param {HTMLElement} frame
   * @param {PointerEvent} event
   */
  #setOrigin(frame, event) {
    const rect = frame.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const x = Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1) * 100;
    const y = Math.min(Math.max((event.clientY - rect.top) / rect.height, 0), 1) * 100;

    frame.style.setProperty('--zoom-origin-x', `${x.toFixed(2)}%`);
    frame.style.setProperty('--zoom-origin-y', `${y.toFixed(2)}%`);
  }

  /** @param {HTMLElement} element - A slide or zoom frame. */
  #resetZoom(element) {
    const frames = element.matches('[data-zoom-frame]')
      ? [element]
      : Array.from(element.querySelectorAll('[data-zoom-frame]'));

    for (const frame of frames) {
      if (frame instanceof HTMLElement) frame.removeAttribute('data-zoomed');
    }
  }
}

if (!customElements.get('zoom-dialog')) {
  customElements.define('zoom-dialog', ZoomDialog);
}
