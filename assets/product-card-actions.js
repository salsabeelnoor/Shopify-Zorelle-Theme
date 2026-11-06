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

  connectedCallback() {
    this.#abortController?.abort();
    this.#abortController = new AbortController();
    const { signal } = this.#abortController;

    this.toggleButton?.addEventListener('click', () => this.setOpen(true, { focus: true }), { signal });
    this.addEventListener('click', this.#handleSizeClick, { signal });
    this.addEventListener('keydown', this.#handleKeydown, { signal });
    this.addEventListener('pointerleave', () => this.setOpen(false), { signal });

    const track = this.track;
    const scrollButton = this.querySelector('[data-card-actions-scroll]');
    if (track && scrollButton instanceof HTMLButtonElement) {
      scrollButton.addEventListener('click', () => track.scrollBy({ left: track.clientWidth * 0.75 }), { signal });
      track.addEventListener('scroll', () => this.#updateScrollButton(), { signal, passive: true });
      this.#resizeObserver = new ResizeObserver(() => this.#updateScrollButton());
      this.#resizeObserver.observe(track);
    }
  }

  disconnectedCallback() {
    this.#abortController?.abort();
    this.#resizeObserver?.disconnect();
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

  #updateScrollButton() {
    const track = this.track;
    const scrollButton = this.querySelector('[data-card-actions-scroll]');
    if (!track || !(scrollButton instanceof HTMLButtonElement)) return;

    const hasMore = track.scrollLeft + track.clientWidth < track.scrollWidth - 1;
    scrollButton.hidden = !hasMore;
  }
}

if (!customElements.get('card-actions')) {
  customElements.define('card-actions', CardActions);
}
