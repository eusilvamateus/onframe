import { Component } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { Alert, Badge, Button, Checkbox, Modal, Ph, ProgressBar, Spinner, Tooltip } from '@onblide/ui';

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

function ProcessingDialog({ model, onRendered }) {
  return (
    <div
      className="onblide-ml-processing-modal-host"
      data-onframe-photos-view="react"
      ref={(node) => {
        if (node) onRendered(node);
      }}
    >
      <Modal open size="sm" title="Otimizando imagens..." closeButton={false}>
        <div className="onblide-ml-processing">
          <Spinner size="lg" label="Otimizando imagens" />
          <p>{model.progressText}</p>
        </div>
        <div className="onblide-ml-processing-progress">
          <ProgressBar value={model.percent} size="sm" />
        </div>
      </Modal>
    </div>
  );
}

function EditorStat({ stat }) {
  return (
    <span className={`onblide-ml-editor-stat${stat.tone ? ` ${stat.tone}` : ''}`}>
      <small>{stat.label}</small>
      <strong>{stat.value}</strong>
    </span>
  );
}

function EditorDiagnostics({ diagnostics }) {
  if (diagnostics.mode === 'loading') {
    return (
      <div className="onblide-ml-editor-empty onblide-ml-editor-empty-loading">
        <Spinner size="sm" label="Analisando dimensões" />
        <span>Analisando...</span>
      </div>
    );
  }
  if (diagnostics.mode !== 'items') {
    return <div className="onblide-ml-editor-empty">{diagnostics.message}</div>;
  }
  return diagnostics.items.map((item) => (
    <article key={item.localId} className={`onblide-ml-diagnostic-card ${item.tone}`}>
      <img src={item.url} alt={`Imagem ${item.index + 1}`} />
      <div className="onblide-ml-diagnostic-main">
        <strong>Imagem {item.index + 1}</strong>
        <span>{item.dimensions}</span>
      </div>
      <span className="onblide-ml-diagnostic-score">
        <Badge tone={item.badgeTone} variant="subtle" dot={false} size="sm">
          {item.score}
        </Badge>
      </span>
      <span className="onblide-ml-diagnostic-state">{item.stateLabel}</span>
    </article>
  ));
}

function EditorDialog({ model, actions, onRendered }) {
  return (
    <div
      className="onblide-ml-modal-backdrop"
      data-onframe-photos-view="react"
      ref={(node) => {
        if (node) onRendered(node);
      }}
    >
      <section className="onblide-ml-modal editor" role="dialog" aria-modal="true" aria-label="Editor completo de fotos">
        <div className="onblide-ml-modal-head">
          <div>
            <div className="onblide-ml-modal-brand">OnFrame</div>
            <h2>Editor de fotos</h2>
          </div>
          <Button
            kind="quiet"
            tone="neutral"
            size="sm"
            iconOnly
            aria-label="Fechar"
            onClick={actions.onClose}
            icon={<Ph n="x" size={18} />}
          />
        </div>
        {model.alert && (
          <div className="onblide-ml-editor-alert">
            <Alert tone={model.alert.tone}>{model.alert.message}</Alert>
          </div>
        )}
        <div className="onblide-ml-editor-top">
          <div className="onblide-ml-editor-stats">
            {model.stats.map((stat) => <EditorStat key={stat.label} stat={stat} />)}
          </div>
          <div className="onblide-ml-editor-actions">
            <Button
              kind="secondary"
              size="sm"
              disabled={model.optimizeDisabled}
              onClick={actions.onOpenOptimize}
              icon={<Ph n="upload" size={14} />}
            >
              Otimizar fotos
            </Button>
            <Button kind="primary" size="sm" disabled={model.saveDisabled} onClick={actions.onCommit}>
              Salvar
            </Button>
            <Button
              kind="quiet"
              tone="danger"
              size="sm"
              disabled={model.discardDisabled}
              onClick={actions.onDiscard}
            >
              Descartar
            </Button>
          </div>
        </div>
        <div className="onblide-ml-editor-strip-shell">
          <div className="onblide-ml-strip onblide-ml-modal-strip" aria-label="Editor completo de fotos do anúncio">
            {model.pictures.map((picture) => (
              <PictureTile key={picture.localId} picture={picture} actions={actions} />
            ))}
            <UploadTile actions={actions} />
          </div>
        </div>
        <div className="onblide-ml-editor-diagnostics-head">
          <strong>Dimensões</strong>
          <Button
            kind="quiet"
            tone="primary"
            fill={false}
            size="sm"
            disabled={model.qualityLoading}
            onClick={actions.onReloadQuality}
            icon={<Ph n="arrows-clockwise" size={14} />}
          >
            Atualizar análise
          </Button>
        </div>
        <div className="onblide-ml-editor-diagnostics">
          <EditorDiagnostics diagnostics={model.diagnostics} />
        </div>
        <div className="onblide-ml-modal-foot">
          <Button kind="secondary" onClick={actions.onClose}>Fechar</Button>
        </div>
      </section>
    </div>
  );
}

function OptimizeReviewItem({ item, onToggle }) {
  return (
    <div className="onblide-ml-review-item">
      <Checkbox
        checked={item.selected}
        ariaLabel={`Selecionar imagem ${item.index + 1}`}
        onChange={(selected) => onToggle(item.localId, selected)}
      />
      <div className="onblide-ml-review-info">
        <strong>Imagem {item.index + 1}</strong>
        <span>{item.dimensions} {'->'} {item.optimizedDimensions}</span>
      </div>
      <div className="onblide-ml-review-preview" aria-hidden="true">
        <img src={item.url} alt="" />
        <span><Ph n="arrows-clockwise" size={14} /></span>
        <img src={item.url} alt="" />
      </div>
      <Badge tone={item.badgeTone} variant="subtle" dot={false} size="sm">
        {item.score}
      </Badge>
    </div>
  );
}

function ReviewDialog({ model, actions, onRendered }) {
  return (
    <div
      className="onblide-ml-modal-backdrop"
      data-onframe-photos-view="react"
      ref={(node) => {
        if (node) onRendered(node);
      }}
    >
      <section className="onblide-ml-modal" role="dialog" aria-modal="true" aria-label="Otimizar imagens">
        <div className="onblide-ml-modal-head">
          <div>
            <div className="onblide-ml-modal-brand">OnFrame</div>
            <h2>Otimizar imagens?</h2>
          </div>
          <Button
            kind="quiet"
            tone="neutral"
            size="sm"
            iconOnly
            aria-label="Fechar"
            onClick={actions.onClose}
            icon={<Ph n="x" size={18} />}
          />
        </div>
        <p className="onblide-ml-modal-copy">
          Redimensiona para 1200px no lado maior e envia ao Mercado Livre.
        </p>
        {model.error && <div className="onblide-ml-dialog-error">{model.error}</div>}
        <div className="onblide-ml-selection-bar">
          <span><strong>{model.selectedCount}</strong> de {model.items.length} selecionadas</span>
          <Button
            className="onblide-ml-selection-action"
            kind="quiet"
            tone="primary"
            fill={false}
            size="sm"
            onClick={model.allSelected ? actions.onClear : actions.onSelectAll}
          >
            {model.allSelected ? 'Desmarcar todas' : 'Selecionar todas'}
          </Button>
        </div>
        <div className="onblide-ml-review-list">
          {model.items.map((item) => (
            <OptimizeReviewItem key={item.localId} item={item} onToggle={actions.onToggle} />
          ))}
        </div>
        <div className="onblide-ml-modal-foot">
          <Button kind="secondary" onClick={actions.onClose}>Cancelar</Button>
          <Button
            kind="primary"
            disabled={!model.selectedCount}
            onClick={actions.onConfirm}
            icon={<Ph n="check-circle" size={16} />}
          >
            Confirmar e salvar ({model.selectedCount})
          </Button>
        </div>
      </section>
    </div>
  );
}

function OptimizeResultItem({ item }) {
  return (
    <div className="onblide-ml-result-item">
      <strong>Imagem {item.index + 1}</strong>
      <div className="onblide-ml-result-grid">
        <figure>
          <img src={item.beforeUrl} alt={`Imagem ${item.index + 1} original`} />
          <figcaption>Original · {item.originalDimensions}</figcaption>
          {item.beforeScore && (
            <span className="onblide-ml-result-score">
              <Badge tone="orange" variant="subtle" dot={false} size="sm">
                {item.beforeScore}
              </Badge>
            </span>
          )}
        </figure>
        <figure className="ok">
          <img src={item.afterUrl} alt={`Imagem ${item.index + 1} otimizada`} />
          <figcaption>Otimizada · {item.optimizedDimensions}</figcaption>
          <span className="onblide-ml-result-score">
            <Badge tone="green" variant="subtle" dot={false} size="sm">100%</Badge>
          </span>
        </figure>
      </div>
    </div>
  );
}

function ResultDialog({ model, actions, onRendered }) {
  return (
    <div
      className="onblide-ml-modal-backdrop"
      data-onframe-photos-view="react"
      ref={(node) => {
        if (node) onRendered(node);
      }}
    >
      <section className="onblide-ml-modal result" role="dialog" aria-modal="true" aria-label="Imagens otimizadas">
        <div className="onblide-ml-modal-head">
          <div>
            <div className="onblide-ml-modal-brand">OnFrame</div>
            <h2>Imagens otimizadas</h2>
          </div>
          <Button
            kind="quiet"
            tone="neutral"
            size="sm"
            iconOnly
            aria-label="Fechar"
            onClick={actions.onClose}
            icon={<Ph n="x" size={18} />}
          />
        </div>
        <p className="onblide-ml-modal-copy">
          Fotos enviadas. O Mercado Livre pode levar alguns minutos para exibir.
        </p>
        <div className="onblide-ml-result-list">
          {model.items.map((item) => <OptimizeResultItem key={item.localId} item={item} />)}
        </div>
        <div className="onblide-ml-modal-foot">
          <Button kind="secondary" onClick={actions.onClose}>Fechar</Button>
        </div>
      </section>
    </div>
  );
}

function PhotoDialog({ model, actions, onRendered }) {
  if (model.mode === 'editor') {
    return <EditorDialog model={model} actions={actions} onRendered={onRendered} />;
  }
  if (model.mode === 'processing') {
    return <ProcessingDialog model={model} onRendered={onRendered} />;
  }
  if (model.mode === 'review') {
    return <ReviewDialog model={model} actions={actions} onRendered={onRendered} />;
  }
  if (model.mode === 'result') {
    return <ResultDialog model={model} actions={actions} onRendered={onRendered} />;
  }
  return <LegacyMarkup markup={model.markup} onRendered={onRendered} />;
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
  const qualityLabel = picture.quality ? ` Qualidade ${picture.quality.label}.` : '';
  return (
    <div
      className={`onblide-ml-tile${qualityClass}`}
      data-picture-id={picture.localId}
      tabIndex={0}
      role="button"
      aria-label={`Foto ${picture.index + 1}.${qualityLabel} Arraste para reordenar.`}
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
        <span className="onblide-ml-quality-indicator" aria-hidden="true">
          <Badge tone={picture.quality.badgeTone} variant="solid" dot={false} size="sm">
            {picture.quality.label}
          </Badge>
        </span>
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

function renderDialog(host, model, callbacks = {}) {
  const root = getRoot(host);
  const onError = typeof callbacks.onError === 'function' ? callbacks.onError : () => {};
  const onRendered = typeof callbacks.onRendered === 'function' ? callbacks.onRendered : () => {};
  const actions = {
    onClose: typeof callbacks.onClose === 'function' ? callbacks.onClose : () => {},
    onOpenOptimize: typeof callbacks.onOpenOptimize === 'function' ? callbacks.onOpenOptimize : () => {},
    onCommit: typeof callbacks.onCommit === 'function' ? callbacks.onCommit : () => {},
    onDiscard: typeof callbacks.onDiscard === 'function' ? callbacks.onDiscard : () => {},
    onReloadQuality: typeof callbacks.onReloadQuality === 'function' ? callbacks.onReloadQuality : () => {},
    onRemove: typeof callbacks.onRemove === 'function' ? callbacks.onRemove : () => {},
    onUpload: typeof callbacks.onUpload === 'function' ? callbacks.onUpload : () => {},
    onUploadFiles: typeof callbacks.onUploadFiles === 'function' ? callbacks.onUploadFiles : () => {},
    onPicturePointerDown: typeof callbacks.onPicturePointerDown === 'function'
      ? callbacks.onPicturePointerDown
      : () => {},
    onMovePicture: typeof callbacks.onMovePicture === 'function' ? callbacks.onMovePicture : () => {},
    onSelectAll: typeof callbacks.onSelectAll === 'function' ? callbacks.onSelectAll : () => {},
    onClear: typeof callbacks.onClear === 'function' ? callbacks.onClear : () => {},
    onToggle: typeof callbacks.onToggle === 'function' ? callbacks.onToggle : () => {},
    onConfirm: typeof callbacks.onConfirm === 'function' ? callbacks.onConfirm : () => {}
  };
  flushSync(() => {
    root.render(
      <PhotosViewBoundary onError={onError}>
        <PhotoDialog model={model} actions={actions} onRendered={onRendered} />
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
