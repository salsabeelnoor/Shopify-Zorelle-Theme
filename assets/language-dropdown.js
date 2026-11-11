import { Component } from '@theme/component';

/**
 * Zorelle header language menu (snippets/language-dropdown.liquid).
 *
 * Opens and closes the language panel, closes it on Escape (returning focus to the toggle)
 * and on clicks outside. Switching language is a plain form submit, so it works without JS.
 *
 * @typedef {object} Refs
 * @property {HTMLButtonElement} toggle - The button that opens the panel.
 * @property {HTMLElement} panel - The language list panel.
 *
 * @extends Component<Refs>
 */
class LanguageDropdown extends Component {
  requiredRefs = ['toggle', 'panel'];

  /** @type {AbortController | undefined} */
  #openController;

  disconnectedCallback() {
    super.disconnectedCallback();
    this.#openController?.abort();
  }

  /** @returns {boolean} Whether the panel is open. */
  get isOpen() {
    return !this.refs.panel.hidden;
  }

  /** Opens or closes the panel. */
  toggle() {
    if (this.isOpen) this.close();
    else this.open();
  }

  /** Opens the panel and focuses the current language. */
  open() {
    const { toggle, panel } = this.refs;
    panel.hidden = false;
    toggle.setAttribute('aria-expanded', 'true');

    this.#openController?.abort();
    this.#openController = new AbortController();
    const { signal } = this.#openController;

    document.addEventListener(
      'click',
      (event) => {
        if (event.target instanceof Node && !this.contains(event.target)) this.close();
      },
      { signal }
    );
    this.addEventListener(
      'keydown',
      (event) => {
        if (event.key !== 'Escape') return;
        event.stopPropagation();
        this.close();
        toggle.focus();
      },
      { signal }
    );

    const current = panel.querySelector('[aria-current="true"]') ?? panel.querySelector('button');
    if (current instanceof HTMLElement) current.focus();
  }

  /** Closes the panel. */
  close() {
    this.#openController?.abort();
    this.refs.panel.hidden = true;
    this.refs.toggle.setAttribute('aria-expanded', 'false');
  }
}

if (!customElements.get('language-dropdown')) {
  customElements.define('language-dropdown', LanguageDropdown);
}
