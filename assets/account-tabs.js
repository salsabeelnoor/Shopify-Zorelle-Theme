/**
 * Zorelle account page (sections/account-dashboard.liquid).
 *
 * Tabs: shows one panel at a time and keeps it in the URL hash (#orders, #addresses …),
 * so links and pagination can open a tab directly. Without JavaScript every panel shows.
 * Order details: buttons with data-order-open="<dialog id>" open that <dialog>; buttons with
 * data-order-close, Escape or a click on the backdrop close it and focus returns to the opener.
 */
const RETURN_TAB_KEY = 'zorelle-account-tab';
const TOAST_KEY = 'zorelle-account-toast';
const TOAST_DURATION = 3500;

class AccountTabs extends HTMLElement {
  /** @type {AbortController | undefined} */
  #controller;

  /** @type {HTMLElement | null} */
  #opener = null;

  connectedCallback() {
    this.#controller?.abort();
    this.#controller = new AbortController();
    const { signal } = this.#controller;

    this.addEventListener('click', this.#handleClick, { signal });
    this.querySelector('[role="tablist"]')?.addEventListener('keydown', this.#handleKeyDown, { signal });
    window.addEventListener('hashchange', () => this.select(this.#hashName(), { focus: false }), { signal });

    for (const dialog of this.querySelectorAll('dialog')) {
      dialog.addEventListener('close', () => this.#opener?.focus(), { signal });
    }

    // Address forms: country → province list, and a confirm step before deleting.
    for (const select of this.querySelectorAll('select[data-country-select]')) {
      if (!(select instanceof HTMLSelectElement)) continue;
      if (select.dataset.default) select.value = select.dataset.default;
      this.#fillProvinces(select, true);
      select.addEventListener('change', () => this.#fillProvinces(select, false), { signal });
    }
    this.addEventListener(
      'submit',
      (event) => {
        const form = event.target;
        if (!(form instanceof HTMLFormElement)) return;
        if (form.dataset.confirm && !window.confirm(form.dataset.confirm)) {
          event.preventDefault();
          return;
        }
        const panel = form.closest('[role="tabpanel"]');
        if (panel?.id !== 'addresses') return;

        // Remember the tab and the action (for the toast), then save in the background:
        // after saving, Shopify redirects to its own account page, so the browser must not
        // follow that redirect.
        let action = 'updated';
        if (form.querySelector('input[name="_method"][value="delete"]')) action = 'deleted';
        else if (form.querySelector('dialog[id^="AccountAddressNew"]')) action = 'added';
        try {
          sessionStorage.setItem(RETURN_TAB_KEY, panel.id);
          sessionStorage.setItem(TOAST_KEY, action);
        } catch {}
        event.preventDefault();
        this.#submitAddressForm(form);
      },
      { signal }
    );

    let startTab = this.#hashName();
    try {
      const returnTab = sessionStorage.getItem(RETURN_TAB_KEY);
      sessionStorage.removeItem(RETURN_TAB_KEY);
      if (returnTab && !window.location.hash) startTab = returnTab;
    } catch {}
    this.select(startTab, { focus: false, updateHash: startTab !== this.#hashName() });

    try {
      const toastAction = sessionStorage.getItem(TOAST_KEY);
      sessionStorage.removeItem(TOAST_KEY);
      if (toastAction) this.#showToast(toastAction);
    } catch {}

    // A form that came back with errors reopens in its dialog.
    const failed = this.querySelector('dialog[data-auto-open]');
    if (failed instanceof HTMLDialogElement) {
      this.select('addresses', { focus: false });
      failed.showModal();
    }
  }

  /**
   * Posts an address form (add, edit or delete) without leaving the page. A redirect means
   * Shopify saved it: reload this page, which reopens the Addresses tab. Any other answer
   * (for example validation errors) falls back to a normal submit so Shopify shows them.
   * @param {HTMLFormElement} form
   */
  async #submitAddressForm(form) {
    if (form.dataset.submitting) return;
    form.dataset.submitting = 'true';
    const buttons = form.querySelectorAll('button[type="submit"]');
    for (const button of buttons) button.setAttribute('aria-disabled', 'true');

    try {
      const response = await fetch(form.action, {
        method: 'POST',
        body: new FormData(form),
        credentials: 'same-origin',
        redirect: 'manual',
      });
      if (response.type === 'opaqueredirect') {
        window.location.reload();
        return;
      }
    } catch {
      // Network or cross-origin failure: let the browser submit the form instead.
    }

    delete form.dataset.submitting;
    for (const button of buttons) button.removeAttribute('aria-disabled');
    try {
      sessionStorage.removeItem(TOAST_KEY);
    } catch {}
    HTMLFormElement.prototype.submit.call(form);
  }

  /** @type {number | undefined} */
  #toastTimer;

  /**
   * Shows the confirmation toast for an address action, then hides it again.
   * @param {string} action - added, updated or deleted.
   */
  #showToast(action) {
    const toast = this.querySelector('[data-account-toast]');
    const text = this.querySelector('[data-account-toast-text]');
    const key = `toast${action.charAt(0).toUpperCase()}${action.slice(1)}`;
    const message = this.dataset[key];
    if (!(toast instanceof HTMLElement) || !text || !message) return;

    toast.hidden = false;
    // Set the text after unhiding so screen readers announce it.
    requestAnimationFrame(() => {
      text.textContent = message;
      toast.classList.add('is-visible');
    });

    window.clearTimeout(this.#toastTimer);
    this.#toastTimer = window.setTimeout(() => {
      toast.classList.remove('is-visible');
      this.#toastTimer = window.setTimeout(() => {
        toast.hidden = true;
      }, 300);
    }, TOAST_DURATION);
  }

  /**
   * Fills the province list for the chosen country, using the data-provinces JSON that
   * Shopify's country option tags carry, and hides the field when the country has none.
   * @param {HTMLSelectElement} countrySelect
   * @param {boolean} useDefault - Select the saved province (first render).
   */
  #fillProvinces(countrySelect, useDefault) {
    const form = countrySelect.closest('form');
    const provinceSelect = form?.querySelector('select[data-province-select]');
    const field = form?.querySelector('[data-province-field]');
    if (!(provinceSelect instanceof HTMLSelectElement) || !(field instanceof HTMLElement)) return;

    /** @type {[string, string][]} */
    let provinces = [];
    try {
      provinces = JSON.parse(countrySelect.selectedOptions[0]?.dataset.provinces ?? '[]');
    } catch {
      provinces = [];
    }

    provinceSelect.replaceChildren(
      ...provinces.map(([value, label]) => new Option(label || value, value))
    );
    field.hidden = provinces.length === 0;
    if (useDefault && provinceSelect.dataset.default) provinceSelect.value = provinceSelect.dataset.default;
  }

  disconnectedCallback() {
    this.#controller?.abort();
    window.clearTimeout(this.#toastTimer);
  }

  /** @returns {HTMLAnchorElement[]} */
  get #tabs() {
    return Array.from(this.querySelectorAll('[role="tab"]'));
  }

  /** @returns {string} The tab named in the URL hash, or the first tab. */
  #hashName() {
    const name = window.location.hash.slice(1);
    const known = this.#tabs.some((tab) => tab.getAttribute('aria-controls') === name);
    return known ? name : this.#tabs[0]?.getAttribute('aria-controls') ?? '';
  }

  /**
   * Shows the panel with this id and marks its tab as selected.
   * @param {string} name - Panel id (overview, orders, addresses, profile).
   * @param {{ focus?: boolean, updateHash?: boolean }} [options]
   */
  select(name, { focus = true, updateHash = true } = {}) {
    for (const tab of this.#tabs) {
      const panel = document.getElementById(tab.getAttribute('aria-controls') ?? '');
      const selected = tab.getAttribute('aria-controls') === name;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
      if (panel) panel.hidden = !selected;
      if (selected && focus) tab.focus();
    }
    if (updateHash && window.location.hash !== `#${name}`) {
      history.replaceState(null, '', `#${name}`);
    }
  }

  /** @param {MouseEvent} event */
  #handleClick = (event) => {
    if (!(event.target instanceof Element)) return;

    // Click on a dialog's backdrop (the dialog element itself, outside its content).
    if (event.target instanceof HTMLDialogElement) {
      event.target.close();
      return;
    }

    const opener = event.target.closest('[data-order-open]');
    if (opener instanceof HTMLElement) {
      const dialog = document.getElementById(opener.dataset.orderOpen ?? '');
      if (dialog instanceof HTMLDialogElement) {
        event.preventDefault();
        this.#opener = opener;
        dialog.showModal();
      }
      return;
    }

    const closer = event.target.closest('[data-order-close]');
    if (closer) {
      closer.closest('dialog')?.close();
      return;
    }

    const tabLink = event.target.closest('[role="tab"], [data-account-tab]');
    if (tabLink instanceof HTMLElement) {
      const name = tabLink.dataset.accountTab ?? tabLink.getAttribute('aria-controls');
      if (!name) return;
      event.preventDefault();
      this.select(name, { focus: tabLink.getAttribute('role') === 'tab' });
      if (tabLink.dataset.accountTab) {
        this.querySelector('[role="tablist"]')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  };

  /** Arrow keys, Home and End move between tabs (mirrored in right-to-left layouts). */
  /** @param {KeyboardEvent} event */
  #handleKeyDown = (event) => {
    const tabs = this.#tabs;
    const current = tabs.findIndex((tab) => tab.getAttribute('aria-selected') === 'true');
    const rtl = getComputedStyle(this).direction === 'rtl';
    const forward = rtl ? 'ArrowLeft' : 'ArrowRight';
    const back = rtl ? 'ArrowRight' : 'ArrowLeft';

    let next = -1;
    if (event.key === forward) next = (current + 1) % tabs.length;
    else if (event.key === back) next = (current - 1 + tabs.length) % tabs.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabs.length - 1;
    if (next < 0) return;

    event.preventDefault();
    const name = tabs[next]?.getAttribute('aria-controls');
    if (name) this.select(name);
  };
}

if (!customElements.get('account-tabs')) {
  customElements.define('account-tabs', AccountTabs);
}
