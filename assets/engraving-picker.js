import { Component } from '@theme/component';
import { StandardEvents } from '@shopify/events';

/**
 * Zorelle engraving picker (blocks/engraving.liquid).
 *
 * Each box is a value of the product's engraving option (e.g. "Engraving: 5 Characters").
 * Choosing a box:
 * - sets the text field's character limit, counter and "max. N characters" hint right away,
 * - selects the same value in the regular variant picker (where this option is hidden), so
 *   Horizon switches the variant: price, URL, availability and the cart line follow natively.
 * After the variant change, the boxes are refreshed from the re-rendered block so their extra
 * prices and availability match the new size / metal. The engraving text is kept.
 *
 * @typedef {object} Refs
 * @property {HTMLInputElement} text - The engraving text field.
 * @property {HTMLElement} [count] - The "0/3" counter.
 * @property {HTMLElement} [hint] - The "Required · max. 3 characters" hint.
 * @property {HTMLElement} [selectedLabel] - The selected value shown next to the label.
 *
 * @extends Component<Refs>
 */
class EngravingPicker extends Component {
  requiredRefs = ['text'];

  /** @type {AbortController | undefined} */
  #controller;

  connectedCallback() {
    super.connectedCallback();

    this.#controller?.abort();
    this.#controller = new AbortController();

    this.#section?.addEventListener(StandardEvents.productSelect, this.#handleProductSelect, {
      signal: this.#controller.signal,
    });

    this.#applySelection();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.#controller?.abort();
  }

  /** @returns {Element | null} The section (or dialog) this picker belongs to. */
  get #section() {
    return this.closest('.shopify-section, dialog');
  }

  /** @returns {HTMLInputElement | null} The checked engraving box. */
  get selectedOption() {
    const checked = this.querySelector('.engraving__radio:checked');
    return checked instanceof HTMLInputElement ? checked : null;
  }

  /** Handles a box being chosen: updates the field, then switches the product variant. */
  select() {
    this.#applySelection();
    this.#selectVariantOption();
  }

  /** Updates the "0/3" counter. */
  updateCount() {
    const { text, count } = this.refs;
    if (count) count.textContent = `${text.value.length}/${text.maxLength}`;
  }

  /** Applies the checked box's character limit, hint and label. */
  #applySelection() {
    const option = this.selectedOption;
    if (!option) return;

    const { text, hint, selectedLabel } = this.refs;
    const max = Number(option.dataset.max) || text.maxLength || 12;

    text.maxLength = max;
    if (text.value.length > max) text.value = text.value.slice(0, max);
    this.updateCount();

    if (hint) hint.textContent = (this.dataset.hintTemplate ?? '').replace('[count]', String(max));
    if (selectedLabel && option.dataset.label) selectedLabel.textContent = option.dataset.label;
  }

  /** Selects the same option value in the regular variant picker so Horizon changes the variant. */
  #selectVariantOption() {
    const option = this.selectedOption;
    const optionName = this.dataset.optionName;
    const picker = this.#section?.querySelector('variant-picker');
    if (!option || !optionName || !picker) return;

    const name = CSS.escape(optionName);

    // Buttons / swatches style.
    const radio = picker.querySelector(
      `input[type="radio"][data-option-name="${name}"][data-input-index="${option.dataset.index}"]`
    );
    if (radio instanceof HTMLInputElement) {
      if (!radio.checked) radio.click();
      return;
    }

    // Dropdown style.
    const choice = picker.querySelector(`option[data-option-name="${name}"][value="${CSS.escape(option.value)}"]`);
    const select = choice?.closest('select');
    if (choice instanceof HTMLOptionElement && select instanceof HTMLSelectElement && select.value !== choice.value) {
      select.value = choice.value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  /** @param {import('@shopify/events').ProductSelectEvent} event */
  #handleProductSelect = (event) => {
    if (!(event.target instanceof Element) || event.target.closest('product-card')) return;

    event.promise
      ?.then(({ detail }) => {
        const updated = detail?.html?.querySelector(`engraving-picker[data-block-id="${this.dataset.blockId}"]`);
        if (!(updated instanceof HTMLElement)) return;

        // Refresh the boxes (extra prices and availability depend on the size / metal).
        const options = this.querySelector('.engraving__options');
        const newOptions = updated.querySelector('.engraving__options');
        if (options && newOptions) options.replaceChildren(...newOptions.childNodes);

        const newLabel = updated.querySelector('[ref="selectedLabel"]');
        if (this.refs.selectedLabel && newLabel) this.refs.selectedLabel.textContent = newLabel.textContent;

        this.#applySelection();
      })
      .catch((error) => {
        if (error?.name !== 'AbortError') console.warn('[engraving-picker] Event promise rejected:', error);
      });
  };
}

if (!customElements.get('engraving-picker')) {
  customElements.define('engraving-picker', EngravingPicker);
}
