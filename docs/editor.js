export function setupEditor(dialog, scrollArea) {
  const viewport = window.visualViewport;
  let scrollPosition = null;
  let viewportHeight;
  let revealFrame;
  let opener;

  function revealFocusedField() {
    if (revealFrame !== undefined) return;
    revealFrame = window.requestAnimationFrame(() => {
      revealFrame = undefined;
      const field = document.activeElement;
      if (!dialog.open || !scrollArea.contains(field) || !field.matches('input, select, textarea')) return;
      if (viewport && Math.abs(viewport.scale - 1) > 0.01) return;

      // Scroll only the editor body. scrollIntoView can also pan the page on iOS.
      const fieldBounds = field.getBoundingClientRect();
      const padding = 8;
      const top = scrollArea.getBoundingClientRect().top + padding;
      const height = scrollArea.clientHeight - 2 * padding;
      if (height <= 0) return;
      const bottom = fieldBounds.top + Math.min(fieldBounds.height, height);
      if (fieldBounds.top < top) scrollArea.scrollTop += fieldBounds.top - top;
      else if (bottom > top + height) scrollArea.scrollTop += bottom - (top + height);
    });
  }

  function fitViewport() {
    // Leave the dialog at its unzoomed dimensions so it can still be pinch-zoomed.
    if (!viewport || Math.abs(viewport.scale - 1) > 0.01) return;
    const height = viewport.height;
    dialog.style.setProperty('--editor-viewport-height', `${height}px`);
    dialog.style.setProperty('--editor-viewport-top', `${viewport.offsetTop}px`);
    if (height < viewportHeight) revealFocusedField();
    viewportHeight = height;
  }

  scrollArea.addEventListener('focusin', event => {
    if (event.target.matches('input, select, textarea')) revealFocusedField();
  });

  dialog.addEventListener('close', () => {
    if (dialog.open || scrollPosition === null) return;
    viewport?.removeEventListener('resize', fitViewport);
    viewport?.removeEventListener('scroll', fitViewport);
    viewportHeight = undefined;
    if (revealFrame !== undefined) window.cancelAnimationFrame(revealFrame);
    revealFrame = undefined;
    document.documentElement.classList.remove('editor-open');
    document.body.style.removeProperty('--editor-scroll-y');
    window.scrollTo({top:scrollPosition, behavior:'instant'});
    scrollPosition = null;
    if (opener) {
      const {action, id, value} = opener.dataset;
      // A background render can replace the button while the dialog is open.
      const target = opener.isConnected ? opener : Array.from(document.querySelectorAll('[data-action]'))
        .find(button => button.dataset.action === action && button.dataset.id === id && button.dataset.value === value);
      target?.focus({preventScroll:true});
    }
    opener = null;
  });

  return {
    open() {
      if (dialog.open) {
        scrollArea.scrollTop = 0;
        return;
      }
      if (scrollPosition === null) scrollPosition = window.scrollY;
      document.body.style.setProperty('--editor-scroll-y', `${-scrollPosition}px`);
      document.documentElement.classList.add('editor-open');
      dialog.style.removeProperty('--editor-viewport-height');
      dialog.style.removeProperty('--editor-viewport-top');
      fitViewport();
      dialog.showModal();
      scrollArea.scrollTop = 0;
      viewport?.addEventListener('resize', fitViewport);
      viewport?.addEventListener('scroll', fitViewport);
    },
    rememberOpener(element) {
      opener = element;
    }
  };
}
