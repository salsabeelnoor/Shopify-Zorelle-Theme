/**
 * Zorelle reviews (theme side of the Zorelle Reviews app).
 *
 * <product-reviews>  Product page: "Show more", photo lightbox and the "Write a review" popup.
 *                    The popup asks /apps/reviews/eligibility which panel to show, then posts
 *                    the form (with photos downscaled in the browser) to /apps/reviews/submit.
 * <reviews-wall>     Home page reviews wall: moving columns, mouse wheel control and photo lightbox.
 */

const PROXY = '/apps/reviews';
const MAX_PHOTOS = 3;
const MAX_PHOTO_SIDE = 2000;
const PHOTO_QUALITY = 0.85;
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/**
 * Downscales an image file to JPEG (longest side MAX_PHOTO_SIDE) so uploads stay small.
 * Falls back to the original file when the browser can't decode it.
 * @param {File} file
 * @returns {Promise<Blob>}
 */
async function downscalePhoto(file) {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_PHOTO_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext('2d');
    if (!context) return file;
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', PHOTO_QUALITY));
    return blob ?? file;
  } catch {
    return file;
  }
}

class ProductReviews extends HTMLElement {
  /** @type {AbortController | undefined} */
  #listeners;
  /** @type {AbortController | undefined} */
  #request;
  /** @type {{ file: File, url: string }[]} */
  #photos = [];
  /** @type {HTMLElement | null} */
  #opener = null;

  connectedCallback() {
    this.#listeners?.abort();
    this.#listeners = new AbortController();
    const { signal } = this.#listeners;

    this.addEventListener('click', this.#handleClick, { signal });
    this.addEventListener('submit', this.#handleSubmit, { signal });
    this.addEventListener('change', this.#handleChange, { signal });

    for (const dialog of this.querySelectorAll('dialog')) {
      // Close when the backdrop (the dialog element itself) is clicked.
      dialog.addEventListener(
        'click',
        (event) => {
          if (event.target === dialog) dialog.close();
        },
        { signal }
      );
      dialog.addEventListener('close', () => this.#handleDialogClose(dialog), { signal });
    }
  }

  disconnectedCallback() {
    this.#listeners?.abort();
    this.#request?.abort();
    this.#clearPhotos();
  }

  get #dialog() {
    return /** @type {HTMLDialogElement | null} */ (this.querySelector('[data-review-dialog]'));
  }

  get #form() {
    return /** @type {HTMLFormElement | null} */ (this.querySelector('[data-review-form]'));
  }

  /** @param {string} key */
  #string(key) {
    const template = /** @type {HTMLTemplateElement | null} */ (this.querySelector('[data-review-strings]'));
    const node = template?.content.querySelector(`[data-key="${key}"]`);
    return node?.textContent?.trim() ?? '';
  }

  /** @param {MouseEvent} event */
  #handleClick = (event) => {
    if (!(event.target instanceof Element)) return;
    const target = event.target;

    // Clicking the star that is already chosen clears the rating. The label's click runs
    // before it checks its radio, so `checked` still holds the previous choice here.
    const star = target.closest('.review-form__star');
    if (star instanceof HTMLLabelElement) {
      const radio = star.control;
      if (radio instanceof HTMLInputElement && radio.checked) {
        event.preventDefault();
        radio.checked = false;
      }
      return;
    }

    const opener = target.closest('[data-review-open]');
    if (opener instanceof HTMLElement) {
      this.#openForm(opener);
      return;
    }

    const close = target.closest('[data-review-close]');
    if (close) {
      close.closest('dialog')?.close();
      return;
    }

    const more = target.closest('[data-review-more-button]');
    if (more instanceof HTMLElement) {
      this.#showMore(more);
      return;
    }

    const photo = target.closest('[data-review-photo]');
    if (photo instanceof HTMLElement) {
      this.#openPhoto(photo);
      return;
    }

    const remove = target.closest('[data-review-remove-photo]');
    if (remove instanceof HTMLElement) {
      this.#removePhoto(Number(remove.dataset.reviewRemovePhoto));
    }
  };

  /** @param {Event} event */
  #handleChange = (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || !input.matches('[data-review-photo-input]')) return;

    const files = Array.from(input.files ?? []);
    input.value = '';
    let rejected = false;

    for (const file of files) {
      if (this.#photos.length >= MAX_PHOTOS) {
        rejected = true;
        break;
      }
      if (!PHOTO_TYPES.includes(file.type) || file.size > MAX_PHOTO_BYTES * 4) {
        rejected = true;
        continue;
      }
      this.#photos.push({ file, url: URL.createObjectURL(file) });
    }

    this.#renderPhotos();
    if (rejected) this.#showError('invalid_photos');
    else this.#showError('');
  };

  /** Reveals the next batch of hidden reviews. */
  /** @param {HTMLElement} button */
  #showMore(button) {
    const hidden = Array.from(this.querySelectorAll('[data-review-more][hidden]'));
    const batch = hidden.slice(0, 6);
    for (const card of batch) card.hidden = false;

    const first = batch[0];
    if (first instanceof HTMLElement) {
      first.setAttribute('tabindex', '-1');
      first.focus({ preventScroll: true });
    }

    if (hidden.length <= batch.length) {
      const wrapper = button.closest('.product-reviews__more');
      if (wrapper instanceof HTMLElement) wrapper.hidden = true;
    }
  }

  /** @param {HTMLElement} trigger */
  #openPhoto(trigger) {
    const lightbox = /** @type {HTMLDialogElement | null} */ (this.querySelector('[data-review-lightbox]'));
    const image = lightbox?.querySelector('[data-review-lightbox-image]');
    if (!lightbox || !(image instanceof HTMLImageElement)) return;

    image.src = trigger.dataset.reviewPhoto ?? '';
    image.alt = trigger.dataset.reviewPhotoAlt ?? '';
    this.#opener = trigger;
    lightbox.showModal();
  }

  /** @param {HTMLElement} opener */
  async #openForm(opener) {
    const dialog = this.#dialog;
    if (!dialog) return;

    this.#opener = opener;
    this.#showPanel('loading');
    dialog.showModal();

    this.#request?.abort();
    this.#request = new AbortController();

    try {
      const url = new URL(`${PROXY}/eligibility`, window.location.origin);
      url.searchParams.set('product_id', this.dataset.productId ?? '');
      const response = await fetch(url, {
        headers: { Accept: 'application/json' },
        credentials: 'same-origin',
        signal: this.#request.signal,
      });
      if (!response.ok) throw new Error(String(response.status));

      const data = await response.json();
      if (!data.signedIn) this.#showPanel('signed_out');
      else if (data.canReview) this.#showPanel('form');
      else if (data.reason === 'already_reviewed') this.#showPanel('already_reviewed');
      else this.#showPanel('not_purchased');
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      // The app can't be reached: show the form, the submit call reports the real problem.
      this.#showPanel('form');
    }
  }

  /** @param {string} name */
  #showPanel(name) {
    const dialog = this.#dialog;
    if (dialog) dialog.dataset.panel = name;

    for (const panel of this.querySelectorAll('[data-review-panel]')) {
      if (panel instanceof HTMLElement) panel.hidden = panel.dataset.reviewPanel !== name;
    }

    const panel = this.querySelector(`[data-review-panel="${name}"]`);
    const focusTarget =
      name === 'form'
        ? panel?.querySelector('input[name="rating"]')
        : panel?.querySelector('a, button') ?? this.querySelector('[data-review-dialog] [data-review-close]');
    if (focusTarget instanceof HTMLElement) focusTarget.focus();
  }

  /** @param {SubmitEvent} event */
  #handleSubmit = async (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || !form.matches('[data-review-form]')) return;
    event.preventDefault();

    const data = new FormData(form);
    const rating = Number(data.get('rating'));
    const title = String(data.get('title') ?? '').trim();
    const body = String(data.get('body') ?? '').trim();

    if (!rating) return this.#showError('invalid_rating', form.querySelector('input[name="rating"]'));
    if (title.length > 120) return this.#showError('invalid_title', form.querySelector('[name="title"]'));
    if (body.length < 10 || body.length > 2000) {
      return this.#showError('invalid_body', form.querySelector('[name="body"]'));
    }

    this.#showError('');
    this.#setSubmitting(true);

    try {
      const payload = new FormData();
      payload.set('product_id', this.dataset.productId ?? '');
      payload.set('rating', String(rating));
      payload.set('title', title);
      payload.set('body', body);

      for (const [index, photo] of this.#photos.entries()) {
        const blob = await downscalePhoto(photo.file);
        const extension = blob.type === 'image/jpeg' ? 'jpg' : photo.file.name.split('.').pop();
        payload.append('photos', blob, `review-photo-${index + 1}.${extension}`);
      }

      const response = await fetch(`${PROXY}/submit`, {
        method: 'POST',
        body: payload,
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
      });
      const result = await response.json().catch(() => ({ ok: false, error: 'generic' }));

      if (response.ok && result.ok) {
        form.reset();
        this.#clearPhotos();
        this.#showPanel('success');
        return;
      }

      const code = result.error ?? 'generic';
      if (code === 'signed_out') this.#showPanel('signed_out');
      else if (code === 'already_reviewed') this.#showPanel('already_reviewed');
      else if (code === 'not_purchased') this.#showPanel('not_purchased');
      else this.#showError(code);
    } catch {
      this.#showError('generic');
    } finally {
      this.#setSubmitting(false);
    }
  };

  /** @param {boolean} submitting */
  #setSubmitting(submitting) {
    const button = this.querySelector('[data-review-submit]');
    if (!(button instanceof HTMLButtonElement)) return;
    button.setAttribute('aria-disabled', String(submitting));
    button.disabled = submitting;
    button.textContent = this.#string(submitting ? 'submitting' : 'submit');
  }

  /**
   * Shows a translated error (by app error code) in the form's alert, or clears it.
   * @param {string} code
   * @param {Element | null} [field]
   */
  #showError(code, field = null) {
    const error = this.querySelector('[data-review-error]');
    if (!(error instanceof HTMLElement)) return;

    if (!code) {
      error.hidden = true;
      error.textContent = '';
      return;
    }

    error.textContent = this.#string(code) || this.#string('generic');
    error.hidden = false;
    if (field instanceof HTMLElement) field.focus();
  }

  #renderPhotos() {
    const list = this.querySelector('[data-review-previews]');
    const add = this.querySelector('[data-review-add-photos]');
    if (!(list instanceof HTMLElement)) return;

    list.replaceChildren(
      ...this.#photos.map((photo, index) => {
        const item = document.createElement('li');
        item.className = 'review-form__preview';

        const image = document.createElement('img');
        image.src = photo.url;
        image.alt = '';

        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'review-form__preview-remove';
        remove.dataset.reviewRemovePhoto = String(index);
        remove.setAttribute('aria-label', `${this.#string('remove_photo')} ${index + 1}`);
        remove.innerHTML =
          '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/></svg>';

        item.append(image, remove);
        return item;
      })
    );

    if (add instanceof HTMLElement) add.hidden = this.#photos.length >= MAX_PHOTOS;
  }

  /** @param {number} index */
  #removePhoto(index) {
    const [removed] = this.#photos.splice(index, 1);
    if (removed) URL.revokeObjectURL(removed.url);
    this.#renderPhotos();
    this.#showError('');
    const input = this.querySelector('[data-review-photo-input]');
    if (input instanceof HTMLElement) input.focus();
  }

  #clearPhotos() {
    for (const photo of this.#photos) URL.revokeObjectURL(photo.url);
    this.#photos = [];
    this.#renderPhotos();
  }

  /**
   * The close event fires asynchronously, so it may arrive after the other dialog opened.
   * Only cancel the eligibility request and restore focus for the dialog that actually closed.
   * @param {HTMLDialogElement} dialog
   */
  #handleDialogClose(dialog) {
    if (dialog === this.#dialog) this.#request?.abort();
    if (this.querySelector('dialog[open]')) return;
    if (this.#opener?.isConnected) this.#opener.focus();
    this.#opener = null;
  }
}

/**
 * Home page reviews wall.
 * Moves each column endlessly (column 1 up, column 2 down, half a loop apart), pauses while
 * the pointer or keyboard focus is inside, and lets the mouse wheel over a column move it
 * further along its own direction (wheel down = its direction, wheel up = back).
 * Each track is its cards followed by an identical copy, so offsets wrap at half its height.
 * Also opens review photos in the section's lightbox. Reduced motion: no movement at all.
 */
class ReviewsWall extends HTMLElement {
  /** @type {AbortController | undefined} */
  #listeners;
  /** @type {{ element: HTMLElement, direction: 1 | -1, offset: number, wheel: number, half: number }[]} */
  #tracks = [];
  /** @type {number | undefined} */
  #frame;
  /** @type {number} */
  #lastTime = 0;
  #visible = false;
  #paused = false;
  /** @type {IntersectionObserver | undefined} */
  #intersection;
  /** @type {ResizeObserver | undefined} */
  #resize;

  connectedCallback() {
    this.#listeners?.abort();
    this.#listeners = new AbortController();
    const { signal } = this.#listeners;

    this.addEventListener('click', this.#handleClick, { signal });

    // Repeated cards are hidden from screen readers; keep their links out of the tab order too.
    for (const control of this.querySelectorAll(
      '[data-reviews-wall-repeat] a, [data-reviews-wall-repeat] button, [data-reviews-wall-copy] a, [data-reviews-wall-copy] button'
    )) {
      control.setAttribute('tabindex', '-1');
    }

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const viewport = this.querySelector('.reviews-wall__viewport');
    if (!(viewport instanceof HTMLElement)) return;

    this.#tracks = Array.from(viewport.querySelectorAll('.reviews-wall__track'))
      .filter((element) => element instanceof HTMLElement)
      .map((element, index) => ({
        element: /** @type {HTMLElement} */ (element),
        direction: index === 0 ? 1 : -1,
        offset: 0,
        wheel: 0,
        half: 0,
      }));

    this.#measure();
    for (const [index, track] of this.#tracks.entries()) {
      if (index > 0) track.offset = track.half / 2;
    }

    const pause = () => (this.#paused = true);
    const resume = () => {
      this.#paused = viewport.matches(':hover, :focus-within');
      if (!this.#paused) this.#start();
    };
    viewport.addEventListener('pointerenter', pause, { signal });
    viewport.addEventListener('pointerleave', resume, { signal });
    viewport.addEventListener('focusin', pause, { signal });
    // focusout fires before focus lands elsewhere, so check once it has moved.
    viewport.addEventListener('focusout', () => requestAnimationFrame(resume), { signal });
    viewport.addEventListener('wheel', this.#handleWheel, { signal, passive: false });

    this.#resize = new ResizeObserver(() => this.#measure());
    this.#resize.observe(viewport);

    this.#intersection = new IntersectionObserver(([entry]) => {
      this.#visible = Boolean(entry?.isIntersecting);
      if (this.#visible) this.#start();
    });
    this.#intersection.observe(viewport);
  }

  disconnectedCallback() {
    this.#listeners?.abort();
    this.#intersection?.disconnect();
    this.#resize?.disconnect();
    if (this.#frame) cancelAnimationFrame(this.#frame);
    this.#frame = undefined;
  }

  /** Seconds for one full loop (one half of a track), from the section setting. */
  get #duration() {
    const value = parseFloat(getComputedStyle(this).getPropertyValue('--reviews-wall-duration'));
    return value > 0 ? value : 60;
  }

  #measure() {
    for (const track of this.#tracks) {
      // Hidden columns (column 2 on phones) measure 0 and simply aren't moved.
      track.half = track.element.offsetHeight / 2;
    }
  }

  /** @param {WheelEvent} event */
  #handleWheel = (event) => {
    if (!(event.target instanceof Element)) return;
    const track = this.#tracks.find((item) => item.element.contains(/** @type {Node} */ (event.target)));
    if (!track || !track.half) return;

    event.preventDefault();
    const pixels = event.deltaMode === 1 ? event.deltaY * 32 : event.deltaMode === 2 ? event.deltaY * 400 : event.deltaY;
    track.wheel += pixels * track.direction;
    this.#start();
  };

  #start() {
    if (this.#frame) return;
    this.#lastTime = performance.now();
    this.#frame = requestAnimationFrame(this.#tick);
  }

  /** @param {number} now */
  #tick = (now) => {
    // Cap the step so a long pause (e.g. a busy main thread) doesn't cause a big jump.
    const seconds = Math.min((now - this.#lastTime) / 1000, 0.25);
    // Wheel easing, the same feel at any frame rate (about 18% of the rest per 60 fps frame).
    const ease = 1 - Math.pow(0.82, seconds * 60);
    this.#lastTime = now;
    let wheelActive = false;

    for (const track of this.#tracks) {
      if (!track.half) continue;

      const auto = this.#paused ? 0 : (track.half / this.#duration) * seconds * track.direction;
      const wheelStep = track.wheel * ease;
      track.wheel -= wheelStep;
      if (Math.abs(track.wheel) < 0.5) track.wheel = 0;
      else wheelActive = true;

      track.offset = (((track.offset + auto + wheelStep) % track.half) + track.half) % track.half;
      track.element.style.transform = `translate3d(0, ${-track.offset}px, 0)`;
    }

    // Stop the loop while off screen, or while paused with no wheel movement left.
    const keepGoing = this.#visible && (!this.#paused || wheelActive);
    this.#frame = keepGoing ? requestAnimationFrame(this.#tick) : undefined;
  };

  /** @param {MouseEvent} event */
  #handleClick = (event) => {
    if (!(event.target instanceof Element)) return;
    const lightbox = /** @type {HTMLDialogElement | null} */ (this.querySelector('[data-review-lightbox]'));
    if (!lightbox) return;

    if (event.target === lightbox || event.target.closest('[data-review-close]')) {
      lightbox.close();
      return;
    }

    const photo = event.target.closest('[data-review-photo]');
    const image = lightbox.querySelector('[data-review-lightbox-image]');
    if (!(photo instanceof HTMLElement) || !(image instanceof HTMLImageElement)) return;

    image.src = photo.dataset.reviewPhoto ?? '';
    image.alt = photo.dataset.reviewPhotoAlt ?? '';
    lightbox.addEventListener('close', () => photo.isConnected && photo.focus(), { once: true });
    lightbox.showModal();
  };
}

if (!customElements.get('product-reviews')) customElements.define('product-reviews', ProductReviews);
if (!customElements.get('reviews-wall')) customElements.define('reviews-wall', ReviewsWall);
