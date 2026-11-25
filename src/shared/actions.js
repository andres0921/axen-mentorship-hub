// Event delegation (replaces inline onclick=… so the CSP can forbid inline script).
// Markup:  <button data-action="open-mentee" data-mentee-id="…">
// Code:    registerActions({ 'open-mentee': (el, event) => … })
const handlers = Object.create(null);

export function registerActions(map) {
  Object.assign(handlers, map);
}

let installed = false;
export function installDelegation(root = document) {
  if (installed) return;
  installed = true;
  root.addEventListener('click', (event) => {
    const el = event.target.closest('[data-action]');
    if (!el || el.tagName === 'FORM') return;
    // Backdrops (data-backdrop) only react to clicks on themselves, not on
    // anything inside the dialog they contain.
    if (el.dataset.backdrop && event.target !== el) return;
    const fn = handlers[el.dataset.action];
    if (!fn) return;
    event.preventDefault();
    fn(el, event);
  });
  const onInput = (event) => {
    const el = event.target.closest('[data-input-action]');
    if (!el) return;
    const fn = handlers[el.dataset.inputAction];
    if (fn) fn(el, event);
  };
  root.addEventListener('input', onInput);
  root.addEventListener('change', onInput);
}
