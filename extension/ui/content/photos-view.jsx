import { Component } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { Button, Ph } from '@onblide/ui';

const roots = new WeakMap();

class PhotosViewBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    queueMicrotask(() => this.props.onError(error));
  }

  render() {
    if (this.state.failed) return null;
    return this.props.children;
  }
}

function LegacyMarkup({ markup, onRendered }) {
  return (
    <div
      data-onframe-photos-view="react"
      style={{ display: 'contents' }}
      ref={(node) => {
        if (node) onRendered(node);
      }}
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  );
}

function PhotoDock({ model, onRendered, onToggle }) {
  if (!model.visible) return null;

  const label = model.expanded ? 'Recolher editor de fotos' : 'Expandir editor de fotos';
  return (
    <div
      className="onblide-ml-dock-shell"
      data-onframe-photos-view="react"
      ref={(node) => {
        if (node) onRendered(node);
      }}
    >
      <svg
        className="onblide-ml-dock-silhouette"
        viewBox="0 0 1000 28"
        preserveAspectRatio="none"
        focusable="false"
        aria-hidden="true"
      >
        <path
          className="onblide-ml-dock-silhouette-fill"
          d="M16 28H390C410 28 414 0 438 0H562C586 0 590 28 610 28H984Z"
        />
      </svg>
      <Button
        className="onblide-ml-dock-tab"
        kind="quiet"
        tone="primary"
        fill={false}
        size="sm"
        iconOnly
        pressed={model.expanded}
        aria-label={label}
        title={label}
        onClick={onToggle}
        style={{ position: 'absolute', width: 160, height: 32, borderRadius: 0 }}
        icon={(
          <span className={`onblide-ml-dock-tab-icon${model.expanded ? ' is-expanded' : ''}`}>
            <Ph n="caret-up" size={16} />
          </span>
        )}
      />
      <div className={`onblide-ml-dock-panel${model.expanded ? ' is-expanded' : ''}`}>
        <div
          className="onblide-ml-dock-content"
          dangerouslySetInnerHTML={{ __html: model.contentMarkup }}
        />
      </div>
    </div>
  );
}

function getRoot(host) {
  if (!host) throw new Error('Host da interface de fotos indisponível.');
  let root = roots.get(host);
  if (!root) {
    root = createRoot(host);
    roots.set(host, root);
  }
  return root;
}

function renderTray(host, model, callbacks = {}) {
  const root = getRoot(host);
  const onError = typeof callbacks.onError === 'function' ? callbacks.onError : () => {};
  const onRendered = typeof callbacks.onRendered === 'function' ? callbacks.onRendered : () => {};
  const onToggle = typeof callbacks.onToggle === 'function' ? callbacks.onToggle : () => {};
  flushSync(() => {
    root.render(
      <PhotosViewBoundary onError={onError}>
        <PhotoDock model={model} onRendered={onRendered} onToggle={onToggle} />
      </PhotosViewBoundary>
    );
  });
}

function renderDialog(host, markup, callbacks = {}) {
  const root = getRoot(host);
  const onError = typeof callbacks.onError === 'function' ? callbacks.onError : () => {};
  const onRendered = typeof callbacks.onRendered === 'function' ? callbacks.onRendered : () => {};
  flushSync(() => {
    root.render(
      <PhotosViewBoundary onError={onError}>
        <LegacyMarkup markup={markup} onRendered={onRendered} />
      </PhotosViewBoundary>
    );
  });
}

function unmount(host) {
  const root = host && roots.get(host);
  if (!root) return;
  flushSync(() => root.unmount());
  roots.delete(host);
}

globalThis.OnFramePhotosView = Object.freeze({
  renderTray,
  renderDialog,
  unmount
});
