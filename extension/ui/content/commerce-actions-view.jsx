import { Component } from 'react';
import { createRoot } from 'react-dom/client';
import { Badge, Button, Chip, Ph } from '@onblide/ui';

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
      role="group"
      aria-label="Preço e promoções"
      onPointerDown={stopPropagation}
      onMouseDown={stopPropagation}
      onTouchStart={stopPropagation}
      onClick={containClick}
    >
      <Chip
        label={<><Ph n="currency-dollar" size={13} /><span>{model.price.label}</span></>}
        size="sm"
        tone={model.price.tone}
        selected={model.active === 'price'}
        onToggle={() => actions.onChange(model.active === 'price' ? null : 'price')}
      />
      <Chip
        label={<><Ph n="tag" size={13} /><span>{model.promotions.label}</span></>}
        size="sm"
        tone={model.promotions.tone}
        selected={model.active === 'promotions'}
        onToggle={() => actions.onChange(model.active === 'promotions' ? null : 'promotions')}
      />
    </div>
  );
}

function ListingBadge() {
  return (
    <Badge tone="green" variant="subtle" dot size="sm">
      Seu anúncio
    </Badge>
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

function renderBadge(host, options = {}) {
  getRoot(host).render(
    <CommerceActionsViewBoundary onError={options.onError || (() => {})}>
      <ListingBadge />
    </CommerceActionsViewBoundary>
  );
}

function unmount(host) {
  const root = host && roots.get(host);
  if (!root) return;
  root.unmount();
  roots.delete(host);
}

globalThis.OnFrameCommerceActionsView = Object.freeze({ render, renderBadge, unmount });
