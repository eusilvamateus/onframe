import { Component } from 'react';
import { createRoot } from 'react-dom/client';
import { Button, ButtonGroup, Ph, ToggleButton } from '@onblide/ui';

const roots = new WeakMap();

class CommerceActionsViewBoundary extends Component {
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

function stopPropagation(event) {
  event.stopPropagation();
}

function containClick(event) {
  event.preventDefault();
  event.stopPropagation();
}

function CommerceActions({ model, actions }) {
  if (model.error) {
    return (
      <div
        className="onframe-commerce-action-group"
        data-commerce-action-group=""
        onPointerDown={stopPropagation}
        onMouseDown={stopPropagation}
        onTouchStart={stopPropagation}
        onClick={containClick}
      >
        <Button
          kind="quiet"
          tone="danger"
          size="sm"
          icon={<Ph n="warning-circle" size={14} />}
          onClick={actions.onReload}
        >
          {model.error}
        </Button>
      </div>
    );
  }

  return (
    <div
      className="onframe-commerce-action-group"
      data-commerce-action-group=""
      onPointerDown={stopPropagation}
      onMouseDown={stopPropagation}
      onTouchStart={stopPropagation}
      onClick={containClick}
    >
      <ButtonGroup
        attached={false}
        selection="single"
        allowEmpty
        size="sm"
        value={model.active || null}
        onChange={actions.onChange}
        ariaLabel="Preço e promoções"
      >
        <ToggleButton
          value="price"
          appearance="outline"
          tone={model.price.tone}
          icon="currency-dollar"
        >
          {model.price.label}
        </ToggleButton>
        <ToggleButton
          value="promotions"
          appearance="outline"
          tone={model.promotions.tone}
          icon="tag"
        >
          {model.promotions.label}
        </ToggleButton>
      </ButtonGroup>
    </div>
  );
}

function getRoot(host) {
  let root = roots.get(host);
  if (!root) {
    root = createRoot(host);
    roots.set(host, root);
  }
  return root;
}

function render(host, model, actions = {}) {
  getRoot(host).render(
    <CommerceActionsViewBoundary onError={actions.onError || (() => {})}>
      <CommerceActions model={model} actions={{
        onChange: actions.onChange || (() => {}),
        onReload: actions.onReload || (() => {})
      }} />
    </CommerceActionsViewBoundary>
  );
}

function unmount(host) {
  const root = host && roots.get(host);
  if (!root) return;
  root.unmount();
  roots.delete(host);
}

globalThis.OnFrameCommerceActionsView = Object.freeze({ render, unmount });
