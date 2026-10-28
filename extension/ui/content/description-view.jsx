import { Component, useEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { Accordion, Alert, Button, Card, Checkbox, Ph, Spinner, Textarea, Tooltip } from '@onblide/ui';

const roots = new WeakMap();

class DescriptionViewBoundary extends Component {
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
      className="onframe-section-edit-action onframe-description-action"
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
      Editar descrição
    </Button>
  );

  if (!model.disabled) return button;
  return (
    <Tooltip label="Expanda esta seção para editar a descrição." placement="top">
      <span
        className="onframe-section-edit-tooltip"
        tabIndex={0}
        role="button"
        aria-label="Editar descrição"
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
      A descrição é definida pelo catálogo. Para editá-la, acesse seu anúncio próprio, como um Anúncio UP ou Anúncio.
    </Alert>
  );
}

function EditorStatus({ status }) {
  if (!status) return null;
  return (
    <span className="onframe-description-state">
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
          <ul className="onframe-description-failure-list">
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

function DescriptionTextField({ model, onChange }) {
  const [value, setValue] = useState(model.text);

  useEffect(() => {
    setValue(model.text);
  }, [model.inputKey, model.text]);

  return (
    <Textarea
      ariaLabel="Descrição do anúncio"
      value={value}
      rows={model.rows}
      resize="vertical"
      disabled={model.disabled}
      onChange={(nextValue) => {
        setValue(nextValue);
        onChange(nextValue);
      }}
    />
  );
}

function DescriptionEditor({ model, actions }) {
  return (
    <section
      className="onframe-description-editor"
      aria-label="Editar descrição"
    >
      <Card
        padding="var(--ob-s-4)"
        style={model.minHeight ? { minHeight: model.minHeight, boxSizing: 'border-box' } : undefined}
      >
        <div className="onframe-description-editor-content">
          <div className="onframe-description-editor-head">
            <strong>Editar descrição</strong>
            <EditorStatus status={model.status} />
          </div>

          <DescriptionTextField
            key={model.inputKey}
            model={model}
            onChange={actions.onTextChange}
          />

          {model.canBulk && (
            <div className="onframe-description-bulk-switch">
              <Checkbox
                checked={model.bulkEnabled}
                disabled={model.saving}
                onChange={actions.onBulkChange}
                label="Aplicar a todas as variações"
                description="Salva direto nas variações ativas deste user_product."
              />
            </div>
          )}

          {model.error && (
            <Alert tone="danger">{model.error}</Alert>
          )}

          <FailureList failures={model.failures} />

          <div className="onframe-description-actions">
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
  if (!host) throw new Error('Host da interface de descrição indisponível.');
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
      <DescriptionViewBoundary onError={onError}>
        {node}
      </DescriptionViewBoundary>
    );
  });
}

function renderAction(host, model, actions = {}) {
  render(host, <EditAction model={model} actions={{ onEdit: actions.onEdit || (() => {}) }} />, actions.onError || (() => {}));
}

function renderCatalogNotice(host, options = {}) {
  render(host, <CatalogNotice />, options.onError || (() => {}));
}

function renderEditor(host, model, actions = {}) {
  render(host, <DescriptionEditor model={model} actions={{
    onTextChange: actions.onTextChange || (() => {}),
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

globalThis.OnFrameDescriptionView = Object.freeze({ renderAction, renderCatalogNotice, renderEditor, unmount });
