import { Component } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { Alert, Button, Datepicker, Input, Modal, Ph, Skeleton, Spinner } from '@onblide/ui';

const roots = new WeakMap();

class DirectDiscountBoundary extends Component {
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

function ModalTitle({ basePrice }) {
  return (
    <span className="onframe-commerce-direct-discount-title">
      <span>Confirme os detalhes da promoção</span>
      <small>Preço base {basePrice}</small>
    </span>
  );
}

function ResultValue({ loading, value }) {
  if (loading) return <Skeleton width={72} height={16} radius="var(--ob-r-xs)" />;
  return <>{value || '—'}</>;
}

function ResultRow({ label, description = '', value, loading = false, tone = '', separated = false }) {
  return (
    <div
      className={`onframe-commerce-direct-discount-line${tone ? ` ${tone}` : ''}${separated ? ' is-separated' : ''}`}
    >
      <span>
        {label}
        {description && <small>{description}</small>}
      </span>
      <strong>
        <ResultValue loading={loading} value={value} />
      </strong>
    </div>
  );
}

function Estimate({ estimate }) {
  return (
    <div className="onframe-commerce-direct-discount-results" aria-busy={estimate.loading || undefined}>
      {estimate.message && (
        <Alert appearance="soft" tone={estimate.tone || 'danger'}>
          {estimate.message}
        </Alert>
      )}
      <ResultRow
        {...estimate.commission}
        loading={estimate.loading}
        tone="onframe-commerce-direct-discount-cost"
        separated
      />
      {estimate.benefits.map((benefit) => (
        <ResultRow
          key={`${benefit.label}:${benefit.value}`}
          {...benefit}
          tone="onframe-commerce-direct-discount-benefit"
        />
      ))}
      <ResultRow {...estimate.shipping} loading={estimate.loading} tone="onframe-commerce-direct-discount-cost" />
      <ResultRow {...estimate.total} loading={estimate.loading} tone="onframe-commerce-direct-discount-total" />
    </div>
  );
}

function DirectDiscountModal({ model, actions }) {
  const submitOnEnter = (event) => {
    if (event.key !== 'Enter' || model.busy) return;
    event.preventDefault();
    actions.onSubmit();
  };

  const footer = (
    <>
      <Button kind="secondary" size="sm" disabled={model.busy} onClick={actions.onClose}>
        Cancelar
      </Button>
      <Button
        kind="primary"
        size="sm"
        disabled={model.busy}
        icon={model.busy ? <Spinner size="xs" label={model.actionLabel} /> : <Ph n="tag" size={14} />}
        onClick={actions.onSubmit}
      >
        {model.actionLabel}
      </Button>
    </>
  );

  return (
    <Modal
      open
      onClose={actions.onClose}
      title={<ModalTitle basePrice={model.basePrice} />}
      size="md"
      maxHeight="calc(100vh - 32px)"
      footer={footer}
    >
      <div className="onframe-commerce-direct-discount">
        {model.error && (
          <Alert appearance="soft" tone="danger">
            {model.error}
          </Alert>
        )}
        <div className="onframe-commerce-direct-discount-calculation" role="group" aria-label="Cálculo do desconto">
          <div className="onframe-commerce-direct-discount-date-range">
            <Datepicker
              label="Data"
              mode="range"
              value={{ start: model.startDate, end: model.endDate }}
              error={model.dateError || undefined}
              disabled={model.busy}
              onChange={actions.onDateChange}
            />
          </div>
          <ResultRow label="Preço base" value={model.basePrice} />
          <div className="onframe-commerce-direct-discount-line onframe-commerce-direct-discount-field">
            <span>Desconto</span>
            <Input
              aria-label="Desconto em porcentagem"
              endAddon="%"
              inputMode="decimal"
              autoComplete="off"
              autoFocus
              value={model.percentage}
              error={model.percentageError || undefined}
              disabled={model.busy}
              onChange={(event) => actions.onPercentageChange(event.target.value)}
              onKeyDown={submitOnEnter}
            />
          </div>
          <div className="onframe-commerce-direct-discount-line onframe-commerce-direct-discount-field">
            <span>Preço promocional</span>
            <Input
              aria-label="Preço promocional"
              startAddon="R$"
              inputMode="decimal"
              autoComplete="off"
              value={model.price}
              error={model.priceError || undefined}
              disabled={model.busy}
              onChange={(event) => actions.onPriceChange(event.target.value)}
              onKeyDown={submitOnEnter}
            />
          </div>
          <Estimate estimate={model.estimate} />
        </div>
      </div>
    </Modal>
  );
}

function getRoot(host) {
  if (!host) throw new Error('Host do desconto direto indisponível.');
  let root = roots.get(host);
  if (!root) {
    root = createRoot(host);
    roots.set(host, root);
  }
  return root;
}

function render(host, model, actions = {}) {
  const root = getRoot(host);
  flushSync(() => {
    root.render(
      <DirectDiscountBoundary onError={actions.onError || (() => {})}>
        <DirectDiscountModal
          model={model}
          actions={{
            onClose: actions.onClose || (() => {}),
            onPercentageChange: actions.onPercentageChange || (() => {}),
            onPriceChange: actions.onPriceChange || (() => {}),
            onDateChange: actions.onDateChange || (() => {}),
            onSubmit: actions.onSubmit || (() => {})
          }}
        />
      </DirectDiscountBoundary>
    );
  });
}

function unmount(host) {
  const root = host && roots.get(host);
  if (!root) return;
  flushSync(() => root.unmount());
  roots.delete(host);
}

globalThis.OnFrameCommerceDirectDiscountView = Object.freeze({ render, unmount });
