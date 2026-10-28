import { Component } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { Alert, Button, Ph, Tooltip } from '@onblide/ui';

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

function unmount(host) {
  const root = host && roots.get(host);
  if (!root) return;
  flushSync(() => root.unmount());
  roots.delete(host);
}

globalThis.OnFrameCharacteristicsView = Object.freeze({ renderAction, renderCatalogNotice, unmount });
