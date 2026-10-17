import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Modal,
  Ph,
  ProgressBar,
  Spinner,
  Tooltip
} from '@onblide/ui';

const roots = new WeakMap();

function render(host, element) {
  if (!host) return;
  let root = roots.get(host);
  if (!root) {
    root = createRoot(host);
    roots.set(host, root);
  }
  root.render(element);
}

function unmount(host) {
  const root = host && roots.get(host);
  if (!root) return;
  root.unmount();
  roots.delete(host);
}

function renderTray(host, model, actions) {
  render(host, <PhotoDock model={model} actions={actions} />);
}

function renderDialog(host, model, actions) {
  render(host, <PhotoDialog model={model} actions={actions} />);
}

function PhotoDock({ model, actions }) {
  if (!model.visible) return null;

  return (
    <div className="onblide-ml-dock-shell">
      <svg className="onblide-ml-dock-silhouette" viewBox="0 0 1000 28" preserveAspectRatio="none" focusable="false" aria-hidden="true">
        <path className="onblide-ml-dock-silhouette-fill" d="M16 28H390C410 28 414 0 438 0H562C586 0 590 28 610 28H984Z" />
      </svg>
      <div className="onblide-ml-dock-tab-host">
        <Tooltip label={model.dock.expanded ? 'Recolher editor de fotos' : 'Expandir editor de fotos'} placement="top">
          <Button
            kind="quiet"
            tone="primary"
            size="sm"
            iconOnly
            pressed={model.dock.expanded}
            aria-label={model.dock.expanded ? 'Recolher editor de fotos' : 'Expandir editor de fotos'}
            aria-expanded={model.dock.expanded}
            onClick={actions.toggleDock}
            icon={<span className={`onblide-ml-dock-tab-icon${model.dock.expanded ? ' is-expanded' : ''}`}><Ph n="caret-up" size={16} /></span>}
          />
        </Tooltip>
      </div>
      <div className={`onblide-ml-dock-panel${model.dock.expanded ? ' is-expanded' : ''}`}>
        <div className="onblide-ml-dock-content">
          <DockContent model={model} actions={actions} />
        </div>
      </div>
    </div>
  );
}

function DockContent({ model, actions }) {
  if (!model.connected) {
    return (
      <div className="onblide-ml-tray-bar">
        <StatusText status={model.status} />
        <Button size="sm" onClick={actions.connect} disabled={model.busy}>Conectar</Button>
        <Button kind="secondary" size="sm" onClick={actions.reload} disabled={model.busy}>Recarregar</Button>
      </div>
    );
  }

  if (model.blocked) {
    if (model.catalog) {
      return (
        <div className="onblide-ml-dock-catalog-notice">
          <Ph n="info" size={16} />
          <span className="onblide-ml-dock-catalog-copy">
            <strong>Este é um anúncio de catálogo</strong>
            <small>As fotos são definidas pelo catálogo. Para gerenciá-las, acesse seu anúncio próprio.</small>
          </span>
        </div>
      );
    }
    return (
      <div className="onblide-ml-tray-bar">
        <StatusText status={model.status} />
        <Button kind="secondary" size="sm" onClick={actions.reload} disabled={model.busy}>Recarregar</Button>
      </div>
    );
  }

  return (
    <>
      <div className="onblide-ml-dock-main">
        <div className="onblide-ml-dock-identity">
          <span className="onblide-ml-dock-identity-icon"><Ph n="image" size={16} /></span>
          <span className="onblide-ml-dock-identity-copy">
            <strong>Editor de fotos</strong>
            <small>{model.limit.counterText || `${model.pictures.length} fotos`}</small>
          </span>
        </div>
        <PictureStrip pictures={model.pictures} busy={model.busy} actions={actions} />
        <div className="onblide-ml-dock-command-stack">
          <Button size="sm" onClick={actions.openEditor} disabled={model.busy} icon={<Ph n="arrow-square-out" size={16} />}>
            Abrir editor
          </Button>
          {model.dirty ? (
            <div className="onblide-ml-tray-actions">
              <Button size="sm" onClick={actions.commit} disabled={model.busy || Boolean(model.limit.message)} style={dockActionStyle}>Salvar</Button>
              <Button kind="quiet" tone="danger" size="sm" onClick={actions.discard} disabled={model.busy} icon={<Ph n="trash" size={14} />} style={dockActionStyle}>Descartar</Button>
            </div>
          ) : null}
        </div>
      </div>
      {model.feedback ? <Alert tone="danger">{model.feedback}</Alert> : null}
    </>
  );
}

function StatusText({ status }) {
  if (!status?.text) return null;
  return <div className={`onblide-ml-status ${status.tone || ''}`.trim()}>{status.text}</div>;
}

function PictureStrip({ pictures, busy, actions, modal = false }) {
  return (
    <div className={`onblide-ml-strip${modal ? ' onblide-ml-modal-strip' : ''}`} aria-label="Editor de fotos do anúncio">
      {pictures.map((picture) => (
        <PictureTile key={picture.localId} picture={picture} busy={busy} actions={actions} />
      ))}
      <UploadTile busy={busy} actions={actions} />
    </div>
  );
}

function PictureTile({ picture, busy, actions }) {
  const onKeyDown = (event) => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      actions.movePicture(picture.localId, -1);
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      actions.movePicture(picture.localId, 1);
    }
  };

  return (
    <div
      className={`onblide-ml-tile${picture.quality ? ` has-quality-${picture.quality.tone}` : ''}`}
      data-picture-id={picture.localId}
      tabIndex={busy ? -1 : 0}
      role="group"
      aria-label={`Foto ${picture.position}. Arraste ou use as setas para reordenar.`}
      onPointerDown={(event) => actions.beginPictureDrag(event, event.currentTarget)}
      onDragStart={(event) => event.preventDefault()}
      onKeyDown={onKeyDown}
    >
      <img src={picture.url} alt="" draggable="false" />
      <span className="onblide-ml-order">{picture.position}</span>
      {picture.quality ? (
        <Tooltip label={picture.quality.message} placement="top">
          <Button
            className={`onblide-ml-quality-badge ${picture.quality.tone}`}
            kind="secondary"
            size="sm"
            aria-label={`Qualidade da foto: ${picture.quality.message}`}
            data-action="quality"
            onClick={() => actions.showQuality(picture.localId)}
            style={qualityBadgeStyle(picture.quality.tone)}
          >
            {picture.quality.label}
          </Button>
        </Tooltip>
      ) : null}
      <span className="onblide-ml-remove-action">
        <Tooltip label="Remover foto" placement="left">
          <Button
            kind="quiet"
            tone="danger"
            size="sm"
            iconOnly
            disabled={busy}
            aria-label="Remover foto"
            data-action="remove"
            onClick={() => actions.removePicture(picture.localId)}
            icon={<Ph n="trash" size={16} />}
          />
        </Tooltip>
      </span>
    </div>
  );
}

function UploadTile({ busy, actions }) {
  const [dragging, setDragging] = useState(false);
  return (
    <Button
      className={`onblide-ml-upload${dragging ? ' is-dragover' : ''}`}
      kind="secondary"
      disabled={busy}
      onClick={actions.selectFiles}
      onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        actions.addFiles(event.dataTransfer.files);
      }}
      style={uploadTileStyle(dragging)}
      icon={<Ph n="upload-simple" size={18} />}
    >
      <span>Selecionar<br />ou arrastar</span>
    </Button>
  );
}

function PhotoDialog({ model, actions }) {
  const dialog = model.dialog;
  if (!dialog) return null;
  if (dialog.mode === 'editor') return <EditorDialog model={model} dialog={dialog} actions={actions} />;
  if (dialog.mode === 'review') return <ReviewDialog dialog={dialog} actions={actions} />;
  if (dialog.mode === 'processing') return <ProcessingDialog dialog={dialog} />;
  if (dialog.mode === 'result') return <ResultDialog dialog={dialog} actions={actions} />;
  return null;
}

function EditorDialog({ model, dialog, actions }) {
  const footer = <Button kind="secondary" onClick={actions.closeDialog}>Fechar</Button>;
  return (
    <Modal open onClose={actions.closeDialog} title="Editor de fotos" width="min(920px, calc(100vw - 36px))" footer={footer}>
      <div className="onblide-ml-editor-content">
        <DialogAlert error={dialog.error || model.error || model.limit.message} notice={dialog.notice} />
        <div className="onblide-ml-editor-top">
          <div className="onblide-ml-editor-stats">
            <Stat label="Escopo" value={model.variation ? 'Variação' : 'Anúncio'} />
            <Stat label="Fotos" value={model.limit.counterText || `${model.pictures.length} fotos`} tone={model.limit.message ? 'error' : ''} />
            <Stat label="Dimensão" value={model.quality.summaryLabel} tone={model.quality.belowIdeal ? 'warn' : ''} />
          </div>
          <div className="onblide-ml-editor-actions">
            <Button kind="secondary" size="sm" onClick={actions.openOptimize} disabled={model.busy || Boolean(model.limit.message) || !model.quality.optimizable} icon={<Ph n="arrows-out" size={16} />}>Otimizar fotos</Button>
            <Button size="sm" onClick={actions.commit} disabled={model.busy || !model.dirty || Boolean(model.limit.message)}>Salvar</Button>
            <Button kind="quiet" tone="danger" size="sm" onClick={actions.discard} disabled={model.busy || !model.dirty} icon={<Ph n="trash" size={14} />}>Descartar</Button>
          </div>
        </div>
        <div className="onblide-ml-editor-strip-shell">
          <PictureStrip pictures={model.pictures} busy={model.busy} actions={actions} modal />
        </div>
        <div className="onblide-ml-editor-diagnostics-head">
          <strong>Dimensões</strong>
          <Button kind="ghost" size="sm" onClick={actions.reloadQuality} disabled={model.quality.loading}>Atualizar análise</Button>
        </div>
        <Diagnostics quality={model.quality} />
      </div>
    </Modal>
  );
}

function DialogAlert({ error, notice }) {
  if (error) return <Alert tone="danger">{error}</Alert>;
  if (notice) return <Alert tone="success">{notice}</Alert>;
  return null;
}

function Stat({ label, value, tone = '' }) {
  return <span className={`onblide-ml-editor-stat ${tone}`.trim()}><small>{label}</small><strong>{value}</strong></span>;
}

function Diagnostics({ quality }) {
  if (quality.loading) return <div className="onblide-ml-editor-empty"><Spinner size="sm" label="Analisando fotos" /> Analisando...</div>;
  if (quality.error) return <Alert tone="warning">{quality.error}</Alert>;
  if (!quality.items.length) return <div className="onblide-ml-editor-empty">Nenhuma foto no rascunho.</div>;
  return (
    <div className="onblide-ml-editor-diagnostics">
      {quality.items.map((item) => (
        <article className={`onblide-ml-diagnostic-card ${item.tone}`} key={item.localId}>
          <img src={item.url} alt="" />
          <div className="onblide-ml-diagnostic-main"><strong>Imagem {item.position}</strong><span>{item.dimensions}</span></div>
          <Badge tone={badgeTone(item.tone)} variant="subtle" dot={false} size="sm">{item.score}</Badge>
          <span className="onblide-ml-diagnostic-state">{item.state}</span>
        </article>
      ))}
    </div>
  );
}

function ReviewDialog({ dialog, actions }) {
  const selectedCount = dialog.items.filter((item) => item.selected).length;
  const allSelected = selectedCount === dialog.items.length;
  const footer = (
    <>
      <Button kind="secondary" onClick={actions.closeDialog}>Cancelar</Button>
      <Button onClick={actions.confirmOptimize} disabled={!selectedCount} icon={<Ph n="check-circle" size={16} />}>Confirmar e salvar ({selectedCount})</Button>
    </>
  );
  return (
    <Modal open onClose={actions.closeDialog} title="Otimizar imagens?" size="lg" footer={footer}>
      <p className="onblide-ml-modal-copy">Redimensiona para 1200px no lado maior e envia ao Mercado Livre.</p>
      {dialog.error ? <Alert tone="danger">{dialog.error}</Alert> : null}
      <div className="onblide-ml-selection-bar">
        <strong>{selectedCount}</strong> de {dialog.items.length} selecionadas
        <Button kind="ghost" size="sm" onClick={allSelected ? actions.clearOptimize : actions.selectAllOptimize}>
          {allSelected ? 'Desmarcar todas' : 'Selecionar todas'}
        </Button>
      </div>
      <div className="onblide-ml-review-list">
        {dialog.items.map((item) => (
          <div className="onblide-ml-review-item" key={item.localId}>
            <Checkbox checked={item.selected} onChange={(checked) => actions.toggleOptimize(item.localId, checked)} ariaLabel={`Selecionar imagem ${item.position}`} />
            <div className="onblide-ml-review-info"><strong>Imagem {item.position}</strong><span>{item.dimensions} para {item.optimizedDimensions}</span></div>
            <div className="onblide-ml-review-preview"><img src={item.url} alt="" /><Ph n="arrow-right" size={14} /><img src={item.url} alt="" /></div>
            <Badge tone={badgeTone(item.tone)} variant="subtle" dot={false} size="sm">{item.score}</Badge>
          </div>
        ))}
      </div>
    </Modal>
  );
}

function ProcessingDialog({ dialog }) {
  const total = Number(dialog.total || 0);
  const processed = Number(dialog.processed || 0);
  const percent = total ? Math.round((processed / total) * 100) : 0;
  return (
    <Modal open title="Otimizando imagens..." size="sm" closeButton={false}>
      <div className="onblide-ml-processing"><Spinner size="lg" label="Otimizando imagens" /><p>{dialog.progressText || 'Aguarde alguns instantes'}</p></div>
      <div style={{ marginTop: 16 }}><ProgressBar value={percent} size="sm" showLabel /></div>
    </Modal>
  );
}

function ResultDialog({ dialog, actions }) {
  const footer = <Button onClick={actions.closeDialog}>Concluir</Button>;
  return (
    <Modal open onClose={actions.closeDialog} title="Imagens otimizadas" size="lg" footer={footer}>
      <p className="onblide-ml-modal-copy">Fotos enviadas. O Mercado Livre pode levar alguns minutos para exibi-las.</p>
      <div className="onblide-ml-result-list">
        {dialog.results.map((result) => (
          <div className="onblide-ml-result-item" key={result.localId}>
            <strong>Imagem {result.position}</strong>
            <div className="onblide-ml-result-grid">
              <ResultFigure label={`Original · ${result.originalDimensions}`} url={result.beforeUrl} score={result.beforeScore} tone="warning" />
              <ResultFigure label={`Otimizada · ${result.optimizedDimensions}`} url={result.afterUrl} score="100%" tone="success" ok />
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}

function ResultFigure({ label, url, score, tone, ok = false }) {
  return (
    <figure className={ok ? 'ok' : ''}>
      <img src={url} alt="" />
      <figcaption>{label}</figcaption>
      {score ? <Badge tone={badgeTone(tone)} variant="subtle" dot={false} size="sm">{score}</Badge> : null}
    </figure>
  );
}

function badgeTone(tone) {
  if (tone === 'ok' || tone === 'success') return 'green';
  if (tone === 'warn' || tone === 'warning') return 'orange';
  if (tone === 'error' || tone === 'danger') return 'red';
  return 'grey';
}

const dockActionStyle = { width: '100%', minWidth: 0, paddingInline: 6, whiteSpace: 'nowrap' };

function qualityBadgeStyle(tone) {
  const colors = {
    error: ['var(--ob-danger)', 'var(--ob-fg-on-color)'],
    warn: ['var(--ob-orange)', 'var(--ob-fg-on-color)'],
    muted: ['var(--ob-fg-mute)', 'var(--ob-fg-on-color)'],
    ok: ['var(--ob-green)', 'var(--ob-fg-on-color)']
  };
  const [background, color] = colors[tone] || colors.muted;
  return { minWidth: 38, minHeight: 20, height: 20, padding: '0 7px', border: 0, background, color, fontSize: 10 };
}

function uploadTileStyle(dragging) {
  return {
    flex: '0 0 80px',
    width: 80,
    height: 80,
    padding: 6,
    flexDirection: 'column',
    gap: 5,
    border: `1px dashed ${dragging ? 'var(--ob-blue)' : 'var(--ob-fg-mute)'}`,
    background: dragging ? 'var(--ob-blue-050)' : 'var(--ob-surface-2)',
    color: 'var(--ob-fg)',
    fontSize: 11,
    lineHeight: 1.2
  };
}

globalThis.OnFramePhotosView = Object.freeze({ renderTray, renderDialog, unmount });
