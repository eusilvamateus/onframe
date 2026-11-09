import { Component, useCallback, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  FileUpload,
  Modal,
  Ph,
  ProgressBar,
  ScrollArea,
  Spinner,
  Tooltip
} from '@onblide/ui';

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

function ModalTitle({ children }) {
  return (
    <span className="onblide-ml-modal-title">
      <span className="onblide-ml-modal-brand">OnFrame</span>
      <span>{children}</span>
    </span>
  );
}

function ModalHost({ children, onRendered }) {
  return (
    <div
      className="onblide-ml-modal-host"
      data-onframe-photos-view="react"
      ref={(node) => {
        if (node) onRendered(node);
      }}
    >
      {children}
    </div>
  );
}

function attachEditorBackdrop(node) {
  if (node) node.classList.add('onblide-ml-modal-backdrop');
}

function attachEditorContent(node) {
  if (node) node.classList.add('onblide-ml-modal', 'editor');
}

function ProcessingDialog({ model, onRendered }) {
  return (
    <ModalHost onRendered={onRendered}>
      <Modal open size="sm" title="Otimizando imagens..." closeButton={false}>
        <div className="onblide-ml-processing">
          <Spinner size="lg" label="Otimizando imagens" />
          <p>{model.progressText}</p>
        </div>
        <div className="onblide-ml-processing-progress">
          <ProgressBar value={model.percent} size="sm" />
        </div>
      </Modal>
    </ModalHost>
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
        <Badge tone={item.badgeTone} appearance="soft" dot={false} size="sm">
          {item.score}
        </Badge>
      </span>
      <span className="onblide-ml-diagnostic-state">{item.stateLabel}</span>
    </article>
  ));
}

function EditorDialog({ model, actions, onRendered }) {
  const footer = (
    <Button kind="secondary" onClick={actions.onClose}>
      Fechar
    </Button>
  );
  return (
    <ModalHost onRendered={onRendered}>
      <Modal
        open
        title={<ModalTitle>Editor de fotos</ModalTitle>}
        width={920}
        maxHeight="calc(100vh - 48px)"
        motion="none"
        backdropRef={attachEditorBackdrop}
        contentRef={attachEditorContent}
        onClose={actions.onClose}
        footer={footer}
      >
        <div className="onblide-ml-editor-modal-content">
          {model.alert && (
            <div className="onblide-ml-editor-alert">
              <Alert appearance="soft" tone={model.alert.tone}>
                {model.alert.message}
              </Alert>
            </div>
          )}
          <div className="onblide-ml-editor-actions">
            <Button
              className="onblide-ml-editor-action"
              kind="quiet"
              tone="primary"
              fill={false}
              size="sm"
              disabled={model.optimizeDisabled}
              onClick={actions.onOpenOptimize}
              icon={<Ph n="upload" size={14} />}
            >
              Otimizar fotos
            </Button>
            <Button
              className="onblide-ml-editor-action"
              kind="primary"
              size="sm"
              disabled={model.saveDisabled}
              onClick={actions.onCommit}
            >
              Salvar
            </Button>
            <Button
              className="onblide-ml-editor-action"
              kind="quiet"
              tone="danger"
              fill={false}
              size="sm"
              disabled={model.discardDisabled}
              onClick={actions.onDiscard}
            >
              Descartar
            </Button>
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
        </div>
      </Modal>
    </ModalHost>
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
        <span>
          {item.dimensions} {'->'} {item.optimizedDimensions}
        </span>
      </div>
      <div className="onblide-ml-review-preview" aria-hidden="true">
        <img src={item.url} alt="" />
        <span>
          <Ph n="arrows-clockwise" size={14} />
        </span>
        <img src={item.url} alt="" />
      </div>
      <Badge tone={item.badgeTone} appearance="soft" dot={false} size="sm">
        {item.score}
      </Badge>
    </div>
  );
}

function ReviewDialog({ model, actions, onRendered }) {
  const footer = (
    <>
      <Button kind="secondary" onClick={actions.onClose}>
        Cancelar
      </Button>
      <Button
        kind="primary"
        disabled={!model.selectedCount}
        onClick={actions.onConfirm}
        icon={<Ph n="check-circle" size={16} />}
      >
        Confirmar e salvar ({model.selectedCount})
      </Button>
    </>
  );
  return (
    <ModalHost onRendered={onRendered}>
      <Modal
        open
        size="lg"
        maxHeight="calc(100vh - 48px)"
        title={<ModalTitle>Otimizar imagens?</ModalTitle>}
        onClose={actions.onClose}
        footer={footer}
      >
        <p className="onblide-ml-modal-copy">Redimensiona para 1200px no lado maior e envia ao Mercado Livre.</p>
        {model.error && <div className="onblide-ml-dialog-error">{model.error}</div>}
        <div className="onblide-ml-selection-bar">
          <span>
            <strong>{model.selectedCount}</strong> de {model.items.length} selecionadas
          </span>
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
      </Modal>
    </ModalHost>
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
              <Badge tone="warning" appearance="soft" dot={false} size="sm">
                {item.beforeScore}
              </Badge>
            </span>
          )}
        </figure>
        <figure className="ok">
          <img src={item.afterUrl} alt={`Imagem ${item.index + 1} otimizada`} />
          <figcaption>Otimizada · {item.optimizedDimensions}</figcaption>
          <span className="onblide-ml-result-score">
            <Badge tone="success" appearance="soft" dot={false} size="sm">
              100%
            </Badge>
          </span>
        </figure>
      </div>
    </div>
  );
}

function ResultDialog({ model, actions, onRendered }) {
  const footer = (
    <Button kind="secondary" onClick={actions.onClose}>
      Fechar
    </Button>
  );
  return (
    <ModalHost onRendered={onRendered}>
      <Modal
        open
        width={640}
        maxHeight="calc(100vh - 48px)"
        title={<ModalTitle>Imagens otimizadas</ModalTitle>}
        onClose={actions.onClose}
        footer={footer}
      >
        <p className="onblide-ml-modal-copy">Fotos enviadas. O Mercado Livre pode levar alguns minutos para exibir.</p>
        <div className="onblide-ml-result-list">
          {model.items.map((item) => (
            <OptimizeResultItem key={item.localId} item={item} />
          ))}
        </div>
      </Modal>
    </ModalHost>
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
  throw new Error(`Modo do diálogo de fotos desconhecido: ${model.mode || 'ausente'}.`);
}

function TrayBar({ model, actions }) {
  const status = model.status;
  const statusClassName = `onblide-ml-dock-state-message${status?.tone === 'error' ? ' is-error' : ''}`;

  return (
    <div className="onblide-ml-dock-state">
      {status && (
        <div className={statusClassName}>
          <span className="onblide-ml-dock-state-icon">
            <Ph n={status.icon || 'info'} size={18} />
          </span>
          <span className="onblide-ml-dock-state-copy">
            {status.title && <strong>{status.title}</strong>}
            <small>{status.text}</small>
          </span>
        </div>
      )}
      {!model.catalog && (
        <div className="onblide-ml-dock-state-actions">
          {!model.blocked && (
            <Button kind="primary" size="sm" onClick={actions.onConnect}>
              Conectar
            </Button>
          )}
          <Button kind="quiet" tone="primary" fill={false} size="sm" onClick={actions.onReload}>
            Recarregar
          </Button>
        </div>
      )}
    </div>
  );
}

function DockIdentity({ counter }) {
  return (
    <div className="onblide-ml-dock-identity">
      <span className="onblide-ml-dock-identity-icon">
        <Ph n="image" size={16} />
      </span>
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
          <Badge tone={picture.quality.badgeTone} appearance="solid" dot={false} size="sm">
            {picture.quality.label}
          </Badge>
        </span>
      )}
      <span className="onblide-ml-remove-action">
        <Tooltip label="Remover foto" placement="top">
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
  const [uploadKey, setUploadKey] = useState(0);
  const queue = useRef(Promise.resolve());
  const upload = useCallback(
    (file) => {
      const pending = queue.current.then(() => actions.onUploadFiles([file]));
      queue.current = pending.catch(() => {});
      return pending;
    },
    [actions]
  );

  return (
    <div className="onblide-ml-upload">
      <FileUpload
        key={uploadKey}
        variant="button"
        multiple
        accept="image/png,image/jpeg"
        acceptLabel="PNG ou JPG"
        buttonLabel="Adicionar"
        upload={upload}
        onChange={(files) => {
          if (files.length && files.every((file) => file.status !== 'uploading')) {
            setUploadKey((current) => current + 1);
          }
        }}
      />
    </div>
  );
}

function EditorDockContent({ model, actions }) {
  return (
    <>
      <div className="onblide-ml-dock-main">
        <DockIdentity counter={model.counter} />
        <div className="onblide-ml-dock-strip-scroll">
          <ScrollArea orientation="horizontal" visibility="hover" height={92} ariaLabel="Editor de fotos do anúncio">
            <div className="onblide-ml-strip onblide-ml-dock-strip">
              {model.pictures.map((picture) => (
                <PictureTile key={picture.localId} picture={picture} actions={actions} />
              ))}
              <UploadTile actions={actions} />
            </div>
          </ScrollArea>
        </div>
        <div className={`onblide-ml-dock-actions${model.dirty ? ' is-dirty' : ''}`}>
          <Button
            className="onblide-ml-dock-action"
            kind={model.dirty ? 'secondary' : 'primary'}
            size="sm"
            disabled={model.busy}
            onClick={actions.onOpenEditor}
            icon={<Ph n="arrow-square-out" size={14} />}
          >
            Abrir editor
          </Button>
          {model.dirty && (
            <div className="onblide-ml-dock-secondary-actions">
              <Button
                className="onblide-ml-dock-action"
                kind="primary"
                size="sm"
                disabled={model.saveDisabled}
                onClick={actions.onCommit}
              >
                Salvar
              </Button>
              <span className="onblide-ml-dock-discard-action">
                <Tooltip label="Descartar alterações" placement="top">
                  <Button
                    className="onblide-ml-dock-action"
                    kind="quiet"
                    tone="danger"
                    fill={false}
                    size="sm"
                    iconOnly
                    disabled={model.busy}
                    aria-label="Descartar alterações"
                    onClick={actions.onDiscard}
                    icon={<Ph n="trash" size={14} />}
                  />
                </Tooltip>
              </span>
            </div>
          )}
        </div>
      </div>
      {model.feedback && <div className={`onblide-ml-tray-feedback ${model.feedback.tone}`}>{model.feedback.text}</div>}
    </>
  );
}

function DockContent({ model, actions }) {
  if (!model.hasContext) return <TrayBar model={model} actions={actions} />;
  if (model.blocked) return <TrayBar model={model} actions={actions} />;
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
      <svg className="onblide-ml-dock-silhouette" viewBox="0 0 240 28" focusable="false" aria-hidden="true">
        <path className="onblide-ml-dock-silhouette-fill" d="M0 28H20C40 28 44 0 68 0H172C196 0 200 28 220 28H240Z" />
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
        icon={
          <span className={`onblide-ml-dock-tab-icon${model.expanded ? ' is-expanded' : ''}`}>
            <Ph n="caret-up" size={16} />
          </span>
        }
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
    onUploadFiles: typeof callbacks.onUploadFiles === 'function' ? callbacks.onUploadFiles : () => {},
    onPicturePointerDown:
      typeof callbacks.onPicturePointerDown === 'function' ? callbacks.onPicturePointerDown : () => {},
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
    onUploadFiles: typeof callbacks.onUploadFiles === 'function' ? callbacks.onUploadFiles : () => {},
    onPicturePointerDown:
      typeof callbacks.onPicturePointerDown === 'function' ? callbacks.onPicturePointerDown : () => {},
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
