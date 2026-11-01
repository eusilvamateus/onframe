import { Component, useEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { Alert, Badge, Button, Card, Checkbox, Input, Ph, Spinner, Tooltip } from '@onblide/ui';

const roots = new WeakMap();

class CommercePriceViewBoundary extends Component {
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

function PriceHeader({ title, badge, onClose }) {
  return (
    <header className="onframe-commerce-price-view-head">
      <strong>{title}</strong>
      {badge?.label && (
        <Badge tone={badge.tone} variant="subtle" size="sm">
          {badge.label}
        </Badge>
      )}
      <Button
        kind="neutral"
        size="sm"
        iconOnly
        aria-label="Fechar"
        icon={<Ph n="x" size={14} />}
        onClick={onClose}
      />
    </header>
  );
}

function PriceField({ field }) {
  if (!field?.label || !field?.value) return null;
  const value = field.description ? (
    <span className="onframe-commerce-price-view-tooltip">
      <Tooltip label={field.description} placement="bottom">
        <strong tabIndex={0}>{field.value}</strong>
      </Tooltip>
    </span>
  ) : <strong>{field.value}</strong>;

  return (
    <div className={`onframe-commerce-popover-price-field ${field.tone || ''}${field.originalPrice ? ' with-transition' : ''}`}>
      <small>{field.label}</small>
      {field.originalPrice ? (
        <>
          <span className="onframe-commerce-popover-price-transition">De <s>{field.originalPrice}</s></span>
          <strong><span className="onframe-commerce-popover-price-transition-prefix">por</span>{field.value}</strong>
        </>
      ) : value}
    </div>
  );
}

function PriceSummary({ model }) {
  return (
    <>
      <div className="onframe-commerce-popover-price-card">
        <Card padding={0}>
          <div className={`onframe-commerce-popover-price-grid${model.fields.length >= 5 ? ' with-benefit' : ''}`}>
            {model.fields.map((field) => <PriceField key={`${field.label}:${field.value}`} field={field} />)}
          </div>
        </Card>
      </div>

      {!!model.scenarios.length && (
        <section className="onframe-commerce-popover-price-conditions" aria-label="Descontos condicionais">
          <div className="onframe-commerce-popover-conditions-head"><small>Descontos condicionais</small></div>
          <div className="onframe-commerce-popover-price-scenario-list">
            {model.scenarios.map((scenario, index) => (
              <div className="onframe-commerce-popover-price-scenario" key={`${scenario.label}:${index}`}>
                <Card padding={0}>
                  <div className="onframe-commerce-popover-price-scenario-grid">
                    <div>
                      <small>Desconto acumulativo</small>
                      <strong>{scenario.label}</strong>
                    </div>
                    {scenario.fields.map((field) => (
                      <div className={`onframe-commerce-popover-price-scenario-field ${field.tone || ''}`} key={`${field.label}:${field.value}`}>
                        <small>{field.label}</small>
                        <strong>{field.value}</strong>
                      </div>
                    ))}
                  </div>
                </Card>
              </div>
            ))}
          </div>
        </section>
      )}

      {model.details && <p className="onframe-commerce-detail">{model.details}</p>}
    </>
  );
}

function BulkStatus({ status }) {
  if (!status) return null;
  if (status.loading) {
    return (
      <div className="onframe-commerce-bulk-status loading" aria-live="polite">
        <Spinner size="xs" label={status.message} />
        {status.message}
      </div>
    );
  }

  return (
    <div className={`onframe-commerce-bulk-status ${status.tone || ''}`} role={status.tone === 'warn' ? 'alert' : undefined}>
      {status.message}
      {!!status.blocked.length && (
        <details>
          <summary>{status.blockedLabel}</summary>
          <ul>
            {status.blocked.map((entry, index) => <li key={`${entry.label}:${index}`}>{entry.label}: {entry.message}</li>)}
          </ul>
        </details>
      )}
    </div>
  );
}

function PriceEditor({ model, actions }) {
  const [draft, setDraft] = useState(model.draft);

  useEffect(() => {
    setDraft(model.draft);
  }, [model.draftKey, model.draft]);

  return (
    <>
      <div className="onframe-commerce-popover-price-edit-card">
        <Card padding={0}>
          <div className="onframe-commerce-popover-price-edit-field">
            <Input
              label="Novo preço"
              inputMode="decimal"
              autoComplete="off"
              value={draft}
              disabled={model.busy}
              onChange={(event) => {
                const nextValue = event.target.value;
                setDraft(nextValue);
                actions.onDraftChange(nextValue);
              }}
            />
          </div>
          {model.canBulk && (
            <div className="onframe-commerce-popover-price-edit-bulk">
              <Checkbox
                checked={model.bulkEnabled}
                disabled={model.busy}
                onChange={actions.onBulkChange}
                label="Aplicar a todas as variações"
                description="Esta aplicação será enviada para as variações ativas desta família."
              />
            </div>
          )}
        </Card>
      </div>
      <BulkStatus status={model.bulkStatus} />
    </>
  );
}

function CommercePricePopover({ model, actions }) {
  return (
    <section
      className="onframe-commerce-popover onframe-commerce-price-view"
      aria-label={model.title}
      onClick={(event) => event.stopPropagation()}
    >
      <PriceHeader title={model.title} badge={model.badge} onClose={actions.onClose} />

      {model.mode === 'loading' && (
        <div className="onframe-commerce-price-view-loading" aria-live="polite">
          <Spinner size="sm" label="Lendo preço do anúncio" />
          <span>Lendo preço do anúncio.</span>
        </div>
      )}

      {model.mode === 'error' && (
        <>
          <Alert tone="danger">{model.error}</Alert>
          <div className="onframe-commerce-actions">
            <Button kind="primary" size="sm" icon={<Ph n="arrow-clockwise" size={14} />} onClick={actions.onReload}>
              Recarregar
            </Button>
          </div>
        </>
      )}

      {model.mode !== 'loading' && model.mode !== 'error' && model.error && (
        <Alert tone="danger">{model.error}</Alert>
      )}

      {model.mode === 'summary' && (
        <>
          <PriceSummary model={model} />
          <div className="onframe-commerce-actions">
            <Button
              kind="primary"
              size="sm"
              disabled={!model.canEdit}
              icon={<Ph n="pencil" size={14} />}
              onClick={actions.onEdit}
            >
              Editar preço base
            </Button>
            {model.hasBlocker && (
              <Button kind="secondary" size="sm" onClick={actions.onToggleDetails}>
                {model.details ? 'Ocultar motivo' : 'Ver motivo'}
              </Button>
            )}
          </div>
        </>
      )}

      {model.mode === 'edit' && (
        <>
          <PriceEditor model={model} actions={actions} />
          <div className="onframe-commerce-actions">
            <Button
              kind="primary"
              size="sm"
              disabled={model.busy}
              icon={model.busy ? <Spinner size="xs" label={model.saveLabel} /> : <Ph n="check-circle" size={14} />}
              onClick={actions.onSave}
            >
              {model.saveLabel}
            </Button>
            <Button kind="secondary" size="sm" disabled={model.busy} onClick={actions.onCancel}>
              Descartar
            </Button>
          </div>
        </>
      )}
    </section>
  );
}

function getRoot(host) {
  if (!host) throw new Error('Host do popover de preço indisponível.');
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
      <CommercePriceViewBoundary onError={actions.onError || (() => {})}>
        <CommercePricePopover model={model} actions={{
          onClose: actions.onClose || (() => {}),
          onReload: actions.onReload || (() => {}),
          onToggleDetails: actions.onToggleDetails || (() => {}),
          onEdit: actions.onEdit || (() => {}),
          onDraftChange: actions.onDraftChange || (() => {}),
          onBulkChange: actions.onBulkChange || (() => {}),
          onSave: actions.onSave || (() => {}),
          onCancel: actions.onCancel || (() => {})
        }} />
      </CommercePriceViewBoundary>
    );
  });
}

function unmount(host) {
  const root = host && roots.get(host);
  if (!root) return;
  flushSync(() => root.unmount());
  roots.delete(host);
}

globalThis.OnFrameCommercePriceView = Object.freeze({ render, unmount });
