import { Component } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { Button, Ph, Tooltip } from '@onblide/ui';

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

function Status({ status }) {
  if (!status) return null;
  const className = `onblide-ml-status${status.tone ? ` ${status.tone}` : ''}`;
  return <div className={className}>{status.text}</div>;
}

function TrayBar({ model, actions }) {
  return (
    <div className="onblide-ml-tray-bar">
      <Status status={model.status} />
      {!model.blocked && (
        <Button kind="primary" size="sm" onClick={actions.onConnect}>
          Conectar
        </Button>
      )}
      <Button kind="secondary" size="sm" onClick={actions.onReload}>
        Recarregar
      </Button>
    </div>
  );
}

function CatalogNotice() {
  return (
    <div className="onblide-ml-dock-catalog-notice">
      <Ph n="info" size={16} />
      <span className="onblide-ml-dock-catalog-copy">
        <strong>Este é um anúncio de catálogo</strong>
        <small>
          As fotos são definidas pelo catálogo. Para gerenciá-las, acesse seu anúncio próprio,
          como um Anúncio UP ou Anúncio.
        </small>
      </span>
    </div>
  );
}

function DockIdentity({ counter }) {
  return (
    <div className="onblide-ml-dock-identity">
      <span className="onblide-ml-dock-identity-icon"><Ph n="image" size={16} /></span>
      <span className="onblide-ml-dock-identity-copy">
        <strong>Editor de fotos</strong>
        <small>{counter}</small>
      </span>
    </div>
  );
}

function PictureTile({ picture, actions }) {
  const qualityClass = picture.quality ? ` has-quality-${picture.quality.tone}` : '';
  return (
    <div
      className={`onblide-ml-tile${qualityClass}`}
      data-picture-id={picture.localId}
      tabIndex={0}
      role="button"
      aria-label={`Foto ${picture.index + 1}. Arraste para reordenar.`}
      onDragStart={(event) => event.preventDefault()}
      onPointerDown={(event) => actions.onPicturePointerDown(event.nativeEvent, event.currentTarget)}
      onKeyDown={(event) => {
        if (event.key === 'ArrowLeft') {
          event.preventDefault();
          actions.onMovePicture(picture.localId, -1);
        }
        if (event.key === 'ArrowRight') {
          event.preventDefault();
          actions.onMovePicture(picture.localId, 1);
        }
      }}
    >
      <img src={picture.url} alt="" draggable={false} />
      <span className="onblide-ml-order">{picture.index + 1}</span>
      {picture.quality && (
        <button
          className={`onblide-ml-quality-badge ${picture.quality.tone}`}
          data-action="quality"
          type="button"
          title={picture.quality.title}
          onClick={() => actions.onQuality(picture.localId)}
        >
          {picture.quality.label}
        </button>
      )}
      <span className="onblide-ml-remove-action">
        <Tooltip label="Remover foto" placement="left">
          <Button
            kind="quiet"
            tone="danger"
            size="sm"
            iconOnly
            data-action="remove"
            aria-label="Remover foto"
            onClick={() => actions.onRemove(picture.localId)}
            icon={<Ph n="trash" size={16} />}
          />
        </Tooltip>
      </span>
    </div>
  );
}

function UploadTile({ actions }) {
  return (
    <div
      className="onblide-ml-upload"
      data-action="upload"
      tabIndex={0}
      role="button"
      onClick={actions.onUpload}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          actions.onUpload();
        }
      }}
      onDragOver={(event) => {
        event.preventDefault();
        event.currentTarget.classList.add('is-dragover');
      }}
      onDragLeave={(event) => event.currentTarget.classList.remove('is-dragover')}
      onDrop={(event) => {
        event.preventDefault();
        event.currentTarget.classList.remove('is-dragover');
        actions.onUploadFiles(event.dataTransfer.files);
      }}
    >
      <Ph n="upload" size={18} />
      <span>Selecionar<br />ou arrastar</span>
    </div>
  );
}

function EditorDockContent({ model, actions }) {
  return (
    <>
      <div className="onblide-ml-dock-main">
        <DockIdentity counter={model.counter} />
        <div className="onblide-ml-strip" aria-label="Editor de fotos do anuncio">
          {model.pictures.map((picture) => (
            <PictureTile key={picture.localId} picture={picture} actions={actions} />
          ))}
          <UploadTile actions={actions} />
        </div>
        <div className="onblide-ml-dock-command-stack">
          <Button
            className="onblide-ml-dock-open-editor"
            kind="primary"
            size="sm"
            disabled={model.busy}
            onClick={actions.onOpenEditor}
            icon={<Ph n="arrow-square-out" size={14} />}
          >
            Abrir editor
          </Button>
          {model.dirty && (
            <div className="onblide-ml-tray-actions">
              <Button
                kind="secondary"
                size="sm"
                disabled={model.saveDisabled}
                onClick={actions.onCommit}
                style={{ width: '100%', minWidth: 0, paddingInline: 6 }}
              >
                Salvar
              </Button>
              <Button
                kind="quiet"
                tone="danger"
                size="sm"
                disabled={model.busy}
                onClick={actions.onDiscard}
                icon={<Ph n="trash" size={13} />}
                style={{ width: '100%', minWidth: 0, paddingInline: 6, gap: 4 }}
              >
                Descartar
              </Button>
            </div>
          )}
        </div>
      </div>
      {model.feedback && (
        <div className={`onblide-ml-tray-feedback ${model.feedback.tone}`}>
          {model.feedback.text}
        </div>
      )}
    </>
  );
}

function DockContent({ model, actions }) {
  if (!model.hasContext) return <TrayBar model={model} actions={actions} />;
  if (model.blocked) return model.catalog ? <CatalogNotice /> : <TrayBar model={model} actions={actions} />;
  return <EditorDockContent model={model} actions={actions} />;
}

function PhotoDock({ model, onRendered, actions }) {
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
        onClick={actions.onToggle}
        style={{ position: 'absolute', width: 160, height: 32, borderRadius: 0 }}
        icon={(
          <span className={`onblide-ml-dock-tab-icon${model.expanded ? ' is-expanded' : ''}`}>
            <Ph n="caret-up" size={16} />
          </span>
        )}
      />
      <div className={`onblide-ml-dock-panel${model.expanded ? ' is-expanded' : ''}`}>
        <div className="onblide-ml-dock-content">
          <DockContent model={model} actions={actions} />
        </div>
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
  const actions = {
    onToggle: typeof callbacks.onToggle === 'function' ? callbacks.onToggle : () => {},
    onConnect: typeof callbacks.onConnect === 'function' ? callbacks.onConnect : () => {},
    onReload: typeof callbacks.onReload === 'function' ? callbacks.onReload : () => {},
    onOpenEditor: typeof callbacks.onOpenEditor === 'function' ? callbacks.onOpenEditor : () => {},
    onCommit: typeof callbacks.onCommit === 'function' ? callbacks.onCommit : () => {},
    onDiscard: typeof callbacks.onDiscard === 'function' ? callbacks.onDiscard : () => {},
    onRemove: typeof callbacks.onRemove === 'function' ? callbacks.onRemove : () => {},
    onQuality: typeof callbacks.onQuality === 'function' ? callbacks.onQuality : () => {},
    onUpload: typeof callbacks.onUpload === 'function' ? callbacks.onUpload : () => {},
    onUploadFiles: typeof callbacks.onUploadFiles === 'function' ? callbacks.onUploadFiles : () => {},
    onPicturePointerDown: typeof callbacks.onPicturePointerDown === 'function'
      ? callbacks.onPicturePointerDown
      : () => {},
    onMovePicture: typeof callbacks.onMovePicture === 'function' ? callbacks.onMovePicture : () => {}
  };
  flushSync(() => {
    root.render(
      <PhotosViewBoundary onError={onError}>
        <PhotoDock model={model} onRendered={onRendered} actions={actions} />
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
