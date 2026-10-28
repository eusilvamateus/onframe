import { Component } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { Accordion, Alert, Button, Card, Checkbox, Ph, Spinner, Tooltip } from '@onblide/ui';

const roots = new WeakMap();

class CharacteristicsViewBoundary extends Component {
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

function EditAction({ model, actions }) {
  const button = (
    <Button
      className="onframe-section-edit-action onframe-characteristics-action"
      kind="quiet"
      tone="primary"
      fill={false}
      size="sm"
      disabled={model.disabled}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        actions.onEdit();
      }}
      icon={<Ph n="pencil" size={14} />}
    >
      Editar características
    </Button>
  );

  if (!model.disabled) return button;
  return (
    <Tooltip label="Expanda esta seção para editar as características." placement="top">
      <span
        className="onframe-section-edit-tooltip"
        tabIndex={0}
        role="button"
        aria-label="Editar características"
        aria-disabled="true"
      >
        {button}
      </span>
    </Tooltip>
  );
}

function CatalogNotice() {
  return (
    <Alert tone="info" title="Este é um anúncio de catálogo">
      As características são definidas pelo catálogo. Para editá-las, acesse seu anúncio próprio, como um Anúncio UP ou Anúncio.
    </Alert>
  );
}

function EditorStatus({ status }) {
  if (!status) return null;
  return (
    <span className="onframe-characteristics-state">
      <Spinner size="xs" label={status} />
      {status}
    </span>
  );
}

function FailureList({ failures }) {
  if (!failures.length) return null;
  const count = failures.length;
  return (
    <Accordion
      ariaLabel="Variações não alteradas"
      items={[{
        id: 'failures',
        icon: 'warning-circle',
        title: `${count} variação${count === 1 ? '' : 'ões'} não alterada${count === 1 ? '' : 's'}`,
        content: (
          <ul className="onframe-characteristics-failure-list">
            {failures.map((failure) => (
              <li key={`${failure.itemId}:${failure.message}`}>
                <strong>{failure.itemId}</strong>: {failure.message}
              </li>
            ))}
          </ul>
        )
      }]}
    />
  );
}

function EditorFooter({ model, actions }) {
  return (
    <section className="onframe-characteristics-footer" aria-label="Ações da edição de características">
      <Card padding="var(--ob-s-3)">
        <div className="onframe-characteristics-footer-content">
          <div className="onframe-characteristics-footer-head">
            <strong>Editando características</strong>
            <EditorStatus status={model.status} />
          </div>

          {model.notice && <Alert tone="info">{model.notice}</Alert>}

          {model.canBulk && (
            <div className="onframe-characteristics-bulk-switch">
              <Checkbox
                checked={model.bulkEnabled}
                disabled={model.disabled}
                onChange={actions.onBulkChange}
                label="Aplicar a todas as variações"
                description="Salva direto nas variações ativas deste user_product."
              />
            </div>
          )}

          {model.error && <Alert tone="danger">{model.error}</Alert>}

          <FailureList failures={model.failures} />

          <div className="onframe-characteristics-actions">
            <Button
              kind="primary"
              size="sm"
              disabled={model.disabled}
              onClick={actions.onSave}
              icon={<Ph n="check-circle" size={14} />}
            >
              Salvar
            </Button>
            <Button kind="secondary" size="sm" disabled={model.saving} onClick={actions.onCancel}>
              Cancelar
            </Button>
          </div>
        </div>
      </Card>
    </section>
  );
}

function getRoot(host) {
  if (!host) throw new Error('Host da interface de características indisponível.');
  let root = roots.get(host);
  if (!root) {
    root = createRoot(host);
    roots.set(host, root);
  }
  return root;
}

function render(host, node, onError) {
  const root = getRoot(host);
  flushSync(() => {
    root.render(
      <CharacteristicsViewBoundary onError={onError}>
        {node}
      </CharacteristicsViewBoundary>
    );
  });
}

function renderAction(host, model, actions = {}) {
  render(host, <EditAction model={model} actions={{ onEdit: actions.onEdit || (() => {}) }} />, actions.onError || (() => {}));
}

function renderCatalogNotice(host, options = {}) {
  render(host, <CatalogNotice />, options.onError || (() => {}));
}

function renderFooter(host, model, actions = {}) {
  render(host, <EditorFooter model={model} actions={{
    onBulkChange: actions.onBulkChange || (() => {}),
    onSave: actions.onSave || (() => {}),
    onCancel: actions.onCancel || (() => {})
  }} />, actions.onError || (() => {}));
}

function unmount(host) {
  const root = host && roots.get(host);
  if (!root) return;
  flushSync(() => root.unmount());
  roots.delete(host);
}

globalThis.OnFrameCharacteristicsView = Object.freeze({ renderAction, renderCatalogNotice, renderFooter, unmount });
