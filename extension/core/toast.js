(function (root, factory) {
  const toast = factory(root);
  if (typeof module === 'object' && module.exports) {
    module.exports = toast;
  } else {
    root.OnFrameToast = toast;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  const DEFAULT_DURATION = 4800;
  const EXIT_DURATION = 200;
  const MAX_VISIBLE = 3;
  const TONES = Object.freeze({
    success: { icon: 'check-circle' },
    info: { icon: 'info' },
    warning: { icon: 'warning' },
    danger: { icon: 'warning' }
  });

  let sequence = 0;
  let stack = null;
  const entries = [];

  function show(options = {}) {
    const title = String(options.title || '').trim();
    if (!title) return null;

    const documentRef = root && root.document;
    if (!documentRef || !documentRef.createElement || !documentRef.body) return null;
    const tone = TONES[options.tone] ? options.tone : 'info';
    while (entries.length >= MAX_VISIBLE) remove(entries[0], true);

    const entry = {
      id: `onframe-toast-${Date.now()}-${sequence += 1}`,
      duration: normalizeDuration(options.duration),
      remaining: normalizeDuration(options.duration),
      startedAt: 0,
      timer: null,
      leaving: false,
      onAction: typeof options.onAction === 'function' ? options.onAction : null,
      element: createToast(documentRef, {
        tone,
        title,
        body: String(options.body || '').trim(),
        action: typeof options.onAction === 'function' ? String(options.action || '').trim() : '',
        onAction: typeof options.onAction === 'function' ? options.onAction : null,
        icon: options.icon !== false
      })
    };

    entry.element.dataset.toastId = entry.id;
    entry.element.querySelector('[data-toast-close]').addEventListener('click', () => remove(entry));
    entry.element.addEventListener('mouseenter', () => pause(entry));
    entry.element.addEventListener('mouseleave', () => resume(entry));
    entry.element.addEventListener('focusin', () => pause(entry));
    entry.element.addEventListener('focusout', (event) => {
      if (!entry.element.contains(event.relatedTarget)) resume(entry);
    });
    const action = entry.element.querySelector('[data-toast-action]');
    if (action) {
      action.addEventListener('click', () => {
        try {
          entry.element.dataset.actioned = 'true';
          entry.onAction();
        } finally {
          remove(entry);
        }
      });
    }

    entries.push(entry);
    ensureStack(documentRef).appendChild(entry.element);
    resume(entry);
    return entry.id;
  }

  function dismiss(id) {
    const entry = entries.find((candidate) => candidate.id === id);
    if (entry) remove(entry);
  }

  function clear() {
    entries.slice().forEach((entry) => remove(entry, true));
  }

  function ensureStack(documentRef) {
    if (stack && stack.ownerDocument === documentRef && stack.isConnected) return stack;
    stack = documentRef.getElementById('onframe-toast-stack');
    if (stack) return stack;
    stack = documentRef.createElement('div');
    stack.id = 'onframe-toast-stack';
    stack.className = 'onframe-toast-stack';
    stack.setAttribute('aria-label', 'Avisos do OnFrame');
    documentRef.body.appendChild(stack);
    return stack;
  }

  function createToast(documentRef, options) {
    const toast = documentRef.createElement('article');
    toast.className = `onframe-toast onframe-toast-${options.tone}`;
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');

    if (options.icon) {
      const chip = documentRef.createElement('span');
      chip.className = 'onframe-toast-icon';
      chip.setAttribute('aria-hidden', 'true');
      chip.appendChild(createIcon(documentRef, TONES[options.tone].icon));
      toast.appendChild(chip);
    }

    const content = documentRef.createElement('div');
    content.className = 'onframe-toast-content';
    const heading = documentRef.createElement('div');
    heading.className = 'onframe-toast-title';
    heading.textContent = options.title;
    content.appendChild(heading);

    if (options.body) {
      const body = documentRef.createElement('div');
      body.className = 'onframe-toast-body';
      body.textContent = options.body;
      content.appendChild(body);
    }

    if (options.action) {
      const action = documentRef.createElement('button');
      action.className = 'onframe-toast-action';
      action.type = 'button';
      action.dataset.toastAction = 'true';
      action.textContent = options.action;
      content.appendChild(action);
    }

    toast.appendChild(content);
    const close = documentRef.createElement('button');
    close.className = 'onframe-toast-close';
    close.type = 'button';
    close.dataset.toastClose = 'true';
    close.setAttribute('aria-label', 'Fechar aviso');
    close.appendChild(createIcon(documentRef, 'x'));
    toast.appendChild(close);
    return toast;
  }

  function createIcon(documentRef, name) {
    const icon = documentRef.createElement('i');
    icon.className = `ph ph-${name}`;
    icon.setAttribute('aria-hidden', 'true');
    return icon;
  }

  function pause(entry) {
    if (!entry || entry.leaving || !entry.timer) return;
    root.clearTimeout(entry.timer);
    entry.timer = null;
    entry.remaining = Math.max(0, entry.remaining - (Date.now() - entry.startedAt));
  }

  function resume(entry) {
    if (!entry || entry.leaving || entry.timer) return;
    if (entry.remaining <= 0) {
      remove(entry);
      return;
    }
    entry.startedAt = Date.now();
    entry.timer = root.setTimeout(() => remove(entry), entry.remaining);
  }

  function remove(entry, immediate = false) {
    if (!entry || entry.leaving) return;
    entry.leaving = true;
    if (entry.timer) root.clearTimeout(entry.timer);
    entry.timer = null;
    const index = entries.indexOf(entry);
    if (index >= 0) entries.splice(index, 1);
    if (!entry.element) return;
    if (immediate) {
      entry.element.remove();
      return;
    }
    entry.element.classList.add('is-leaving');
    root.setTimeout(() => entry.element.remove(), EXIT_DURATION);
  }

  function normalizeDuration(value) {
    const duration = Number(value);
    return Number.isFinite(duration) && duration > 0 ? duration : DEFAULT_DURATION;
  }

  return { show, dismiss, clear };
});
