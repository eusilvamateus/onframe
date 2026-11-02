import React from 'react';
import { createRoot } from 'react-dom/client';
import { ToastStack, toast } from '@onblide/ui';

const ROOT_ID = 'onframe-toast-root';

function ensureToastStack() {
  let host = document.getElementById(ROOT_ID);
  if (!host) {
    host = document.createElement('div');
    host.id = ROOT_ID;
    host.dataset.onframeRoot = 'toast';
    document.body.appendChild(host);
  }

  if (!host.dataset.onframeMounted) {
    host.dataset.onframeMounted = 'true';
    createRoot(host).render(
      <ToastStack position="bottom-right" duration={4800} limit={3} />,
    );
  }
}

function show(options = {}) {
  const title = String(options.title || '').trim();
  if (!title) return null;
  ensureToastStack();
  return toast({
    tone: options.tone,
    title,
    body: options.body ? String(options.body).trim() : undefined,
    action: typeof options.onAction === 'function' && options.action
      ? String(options.action).trim()
      : undefined,
    onAction: typeof options.onAction === 'function' ? options.onAction : undefined,
    icon: options.icon !== false,
    duration: options.duration,
  });
}

function dismiss(id) {
  toast.dismiss(id);
}

function clear() {
  toast.dismiss();
}

ensureToastStack();

globalThis.OnFrameToast = Object.freeze({ show, dismiss, clear });
