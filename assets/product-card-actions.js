/**
 * Zorelle product card CTA (<card-actions>), rendered by snippets/product-card-actions.liquid.
 *
 * Size mode: the "Add to cart" toggle reveals size buttons (on hover via CSS, on tap/Enter
 * via the [open] attribute). Choosing a size writes its variant ID into the product form
 * and submits it, so Horizon's product-form-component handles the add to cart.
 */
class CardActions extends HTMLElement {
  /** @type {AbortController | undefined} */
  #abortController;

  /** @type {ResizeObserver | undefined} */
  #resizeObserver;

  /** @type {ReturnType<typeof setTimeout> | undefined} */
  #scrollTimer;

  connectedCallback() {
    this.#abortController?.abort();
    this.#abortController = new AbortController();
    const { signal } = this.#abortController;

    this.toggleButton?.addEventListener('click', () => this.setOpen(true, { focus: true }), { signal });
    this.addEventListener('click', this.#handleSizeClick, { signal });
    this.addEventListener('keydown', this.#handleKeydown, { signal });
    this.addEventListener('pointerleave', () => this.setOpen(false), { signal });

    const track = this.track;
    if (track) {
      for (const button of this.querySelectorAll('[data-card-actions-scroll]')) {
        if (!(button instanceof HTMLButtonElement)) continue;
        const step = button.dataset.cardActionsScroll === 'prev' ? -1 : 1;
        button.addEventListener('click', () => this.#scrollSizes(step), { signal });
      }
      track.addEventListener('scroll', () => this.#updateScrollButton(), { signal, passive: true });
      track.addEventListener('scrollend', () => this.#updateScrollButton(), { signal });
      this.#resizeObserver = new ResizeObserver(() => this.#updateScrollButton());
      this.#resizeObserver.observe(track);
    }
  }

  disconnectedCallback() {
    this.#abortController?.abort();
    this.#resizeObserver?.disconnect();
    clearTimeout(this.#scrollTimer);
  }

  get toggleButton() {
    const button = this.querySelector('[data-card-actions-toggle]');
    return button instanceof HTMLButtonElement ? button : null;
  }

  get track() {
    const track = this.querySelector('[data-card-actions-track]');
    return track instanceof HTMLElement ? track : null;
  }

  /**
   * Opens or closes the size picker.
   * @param {boolean} open
   * @param {{ focus?: boolean }} [options]
   */
  setOpen(open, { focus = false } = {}) {
    const toggle = this.toggleButton;
    if (!toggle) return;

    this.toggleAttribute('open', open);
    toggle.setAttribute('aria-expanded', `${open}`);

    if (open) {
      this.#updateScrollButton();
      if (focus) this.querySelector('[data-variant-id]:not(:disabled)')?.focus();
    }
  }

  /** @param {MouseEvent} event */
  #handleSizeClick = (event) => {
    if (!(event.target instanceof Element)) return;
    const sizeButton = event.target.closest('[data-variant-id]');
    if (!(sizeButton instanceof HTMLButtonElement) || sizeButton.disabled) return;

    const form = this.querySelector('form');
    const idInput = form?.querySelector('input[name="id"]');
    if (!(form instanceof HTMLFormElement) || !(idInput instanceof HTMLInputElement)) return;

    idInput.value = sizeButton.dataset.variantId ?? '';
    idInput.disabled = false;
    form.requestSubmit();
  };

  /** @param {KeyboardEvent} event */
  #handleKeydown = (event) => {
    if (event.key !== 'Escape' || !this.hasAttribute('open')) return;
    this.setOpen(false);
    this.toggleButton?.focus();
  };

  /**
   * Scrolls the size list one step towards the end (1) or the start (-1).
   * @param {1 | -1} step
   */
  #scrollSizes(step) {
    const track = this.track;
    if (!track) return;
    const rtl = getComputedStyle(track).direction === 'rtl' ? -1 : 1;
    track.scrollBy({ left: track.clientWidth * 0.75 * step * rtl });
    // Fallback for browsers without scrollend: re-check once smooth scrolling settles.
    clearTimeout(this.#scrollTimer);
    this.#scrollTimer = setTimeout(() => this.#updateScrollButton(), 400);
  }

  /** Shows each arrow only when there are more sizes in that direction. */
  #updateScrollButton() {
    const track = this.track;
    if (!track) return;

    // scrollLeft is negative in RTL; use its distance from the start edge.
    const fromStart = Math.abs(track.scrollLeft);
    const canGoBack = fromStart > 1;
    const canGoForward = fromStart + track.clientWidth < track.scrollWidth - 1;

    for (const button of this.querySelectorAll('[data-card-actions-scroll]')) {
      if (!(button instanceof HTMLButtonElement)) continue;
      button.hidden = button.dataset.cardActionsScroll === 'prev' ? !canGoBack : !canGoForward;
    }
  }
}

if (!customElements.get('card-actions')) {
  customElements.define('card-actions', CardActions);
}
