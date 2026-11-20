export function setupEditor(dialog, scrollArea) {
  const viewport = window.visualViewport;
  let scrollPosition = null;
  let opener;

  function fitViewport() {
    // Leave the dialog at its unzoomed dimensions so it can still be pinch-zoomed.
    if (!viewport || Math.abs(viewport.scale - 1) > 0.01) return;
    dialog.style.setProperty('--editor-viewport-height', `${viewport.height}px`);
    dialog.style.setProperty('--editor-viewport-top', `${viewport.offsetTop}px`);
  }

  dialog.addEventListener('close', () => {
    if (dialog.open || scrollPosition === null) return;
    viewport?.removeEventListener('resize', fitViewport);
    viewport?.removeEventListener('scroll', fitViewport);
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
