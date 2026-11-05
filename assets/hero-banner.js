/**
 * Background video controller for the Hero banner section.
 * Adds a pause/play toggle (autoplaying motion needs a pause control) and
 * respects prefers-reduced-motion by starting paused.
 */
class HeroBannerVideo extends HTMLElement {
  /** @type {AbortController | undefined} */
  #abortController;

  connectedCallback() {
    this.#abortController?.abort();
    this.#abortController = new AbortController();
    const { signal } = this.#abortController;

    const video = this.querySelector('video');
    const toggle = this.querySelector('[data-hero-video-toggle]');
    if (!(video instanceof HTMLVideoElement) || !(toggle instanceof HTMLButtonElement)) return;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (reducedMotion.matches) video.pause();

    const sync = () => {
      const paused = video.paused;
      toggle.setAttribute('aria-pressed', `${paused}`);
      toggle.setAttribute('aria-label', paused ? toggle.dataset.labelPlay ?? '' : toggle.dataset.labelPause ?? '');
      this.toggleAttribute('paused', paused);
    };

    toggle.addEventListener(
      'click',
      async () => {
        if (video.paused) {
          try {
            await video.play();
          } catch {
            // Playback can be blocked (e.g. data saver); keep the paused state.
          }
        } else {
          video.pause();
        }
      },
      { signal }
    );

    video.addEventListener('play', sync, { signal });
    video.addEventListener('pause', sync, { signal });
    sync();
  }

  disconnectedCallback() {
    this.#abortController?.abort();
  }
}

if (!customElements.get('hero-banner-video')) {
  customElements.define('hero-banner-video', HeroBannerVideo);
}
