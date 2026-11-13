/**
 * Zorelle account page side menu (sections/account-dashboard.liquid).
 *
 * Marks the menu link of the section currently in view with aria-current="location"
 * (styled as the active link). The active section is the last one whose top has passed a
 * line just below the sticky header, so short sections at the end still activate once
 * the page is scrolled to the bottom.
 */
class AccountNav extends HTMLElement {
  /** @type {AbortController | undefined} */
  #controller;

  /** @type {number | undefined} */
  #frame;

  connectedCallback() {
    this.#controller?.abort();
    this.#controller = new AbortController();
    const { signal } = this.#controller;

    window.addEventListener('scroll', this.#schedule, { passive: true, signal });
    window.addEventListener('resize', this.#schedule, { passive: true, signal });
    // The page may scroll inside .page-wrapper rather than the window.
    document.querySelector('.page-wrapper')?.addEventListener('scroll', this.#schedule, { passive: true, signal });

    for (const link of this.#links) {
      link.addEventListener('click', () => this.#setActive(link), { signal });
    }

    this.#update();
  }

  disconnectedCallback() {
    this.#controller?.abort();
    if (this.#frame) cancelAnimationFrame(this.#frame);
  }

  /** @returns {HTMLAnchorElement[]} The in-page menu links. */
  get #links() {
    return Array.from(this.querySelectorAll('a[href^="#"]'));
  }

  #schedule = () => {
    if (this.#frame) return;
    this.#frame = requestAnimationFrame(() => {
      this.#frame = undefined;
      this.#update();
    });
  };

  #update() {
    const links = this.#links;
    if (!links.length) return;

    const headerOffset = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header-height')) || 66;
    const line = headerOffset + window.innerHeight * 0.25;

    let active = links[0];
    for (const link of links) {
      const target = document.getElementById(link.hash.slice(1));
      if (target && target.getBoundingClientRect().top <= line) active = link;
    }

    // At the very bottom of the page, the last section is the active one. The theme can
    // scroll inside .page-wrapper instead of the document, so check whichever scrolls.
    const wrapper = document.querySelector('.page-wrapper');
    const scroller =
      wrapper && wrapper.scrollHeight > wrapper.clientHeight + 1 ? wrapper : document.scrollingElement;
    if (scroller && Math.ceil(scroller.scrollTop + scroller.clientHeight) >= scroller.scrollHeight - 2) {
      active = links[links.length - 1];
    }

    this.#setActive(active);
  }

  /** @param {HTMLAnchorElement} active */
  #setActive(active) {
    for (const link of this.#links) {
      if (link === active) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    }
  }
}

if (!customElements.get('account-nav')) {
  customElements.define('account-nav', AccountNav);
}
