import { Component, useEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { Accordion, Alert, Badge, Button, Card, Checkbox, Input, Ph, Spinner, Tooltip } from '@onblide/ui';

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
        <Badge tone={badge.tone} appearance="soft" size="sm" dot>
          {badge.label}
        </Badge>
      )}
      <Button kind="neutral" size="sm" iconOnly aria-label="Fechar" icon={<Ph n="x" size={14} />} onClick={onClose} />
    </header>
  );
}

function PriceSummaryTitle({ field, promoted }) {
  return (
    <span className="onframe-commerce-popover-summary-title price">
      <span className="onframe-commerce-popover-summary-icon price" aria-hidden="true">
        <Ph n="currency-circle-dollar" size={17} />
      </span>
      <span className="onframe-commerce-popover-summary-copy">
        <span>{field?.label || 'Preço atual'}</span>
        <strong>{field?.value || '—'}</strong>
      </span>
      {promoted && (
        <Badge tone="success" appearance="soft" size="sm" dot>
          Com promoção
        </Badge>
      )}
    </span>
  );
}

function PriceBreakdownRow({ field }) {
  if (!field?.label || !field?.value) return null;
  return (
    <div className={`onframe-commerce-price-breakdown-row ${field.tone || ''}`}>
      <span>
        <strong>{field.label}</strong>
        {field.description && <small>{field.description}</small>}
        {field.originalPrice && <small>Preço base {field.originalPrice}</small>}
      </span>
      <span className="onframe-commerce-price-breakdown-value">
        <strong>{field.value}</strong>
        {field.secondaryValue && <small>{field.secondaryValue}</small>}
      </span>
    </div>
  );
}

function PriceScenarios({ scenarios }) {
  if (!scenarios.length) return null;
  return (
    <section className="onframe-commerce-price-scenarios" aria-label="Descontos condicionais">
      <small className="onframe-commerce-price-scenarios-label">Descontos condicionais</small>
      {scenarios.map((scenario, index) => (
        <div className="onframe-commerce-price-scenario" key={`${scenario.label}:${index}`}>
          <strong>{scenario.label}</strong>
          <div>
            {scenario.fields.map((field) => (
              <span className={field.tone || ''} key={`${field.label}:${field.value}`}>
                <small>{field.label}</small>
                <strong>{field.value}</strong>
              </span>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}

function PriceSummary({ model, actions }) {
  const priceField = model.fields[0] || null;
  const heroField = model.fields.find((field) => field.label === 'Você recebe') || priceField;
  const breakdown = model.fields.filter((field) => field !== heroField);
  const promoted = Boolean(priceField?.originalPrice);
  const basePrice = priceField?.originalPrice || priceField?.value || '—';
  const summaryItems = [
    {
      id: 'price-summary',
      title: <PriceSummaryTitle field={heroField} promoted={promoted} />,
      content: (
        <div className="onframe-commerce-price-breakdown">
          {model.sellingIn && (
            <div className="onframe-commerce-price-promotion-link">
              <small>Vendendo em:</small>
              <Button
                kind="quiet"
                tone="primary"
                size="sm"
                icon={<Ph n="tag" size={14} />}
                onClick={actions.onOpenPromotion}
              >
                <span className="onframe-commerce-price-promotion-link-label">{model.sellingIn.label}</span>
              </Button>
            </div>
          )}
          {breakdown.map((field) => (
            <PriceBreakdownRow key={`${field.label}:${field.value}`} field={field} />
          ))}
          <PriceScenarios scenarios={model.scenarios} />
        </div>
      )
    }
  ];

  return (
    <div className="onframe-commerce-popover-summary">
      <Accordion items={summaryItems} type="single" ariaLabel="Resumo do preço" />
      <div className="onframe-commerce-price-base">
        <span className="onframe-commerce-popover-summary-icon base" aria-hidden="true">
          <Ph n="tag" size={17} />
        </span>
        <span>
          <small>Preço base</small>
          <strong>{basePrice}</strong>
          <span>{promoted ? 'Preço original antes da promoção' : 'Preço atual do anúncio'}</span>
        </span>
        <Tooltip
          label={model.canEdit ? 'Editar preço base' : 'Este preço não pode ser editado agora'}
          placement="bottom"
        >
          <span>
            <Button
              kind="neutral"
              size="sm"
              iconOnly
              disabled={!model.canEdit}
              aria-label="Editar preço base"
              icon={<Ph n="pencil-simple" size={15} />}
              onClick={actions.onEdit}
            />
          </span>
        </Tooltip>
      </div>

      {model.details && <p className="onframe-commerce-detail">{model.details}</p>}
      {model.hasBlocker && (
        <div className="onframe-commerce-price-blocker-action">
          <Button kind="secondary" size="sm" onClick={actions.onToggleDetails}>
            {model.details ? 'Ocultar motivo' : 'Ver motivo'}
          </Button>
        </div>
      )}
    </div>
  );
}

function BulkStatus({ status }) {
  if (!status) return null;
  if (status.loading) {
    return (
      <div className="onframe-commerce-bulk-status" aria-live="polite">
        <Alert appearance="soft" tone="info">
          <span className="onframe-commerce-bulk-status-loading">
            <Spinner size="xs" label={status.message} />
            {status.message}
          </span>
        </Alert>
      </div>
    );
  }

  const blockedItems = status.blocked.length
    ? [
        {
          id: 'blocked-variations',
          title: status.blockedLabel,
          content: (
            <ul className="onframe-commerce-bulk-status-list">
              {status.blocked.map((entry, index) => (
                <li key={`${entry.label}:${index}`}>
                  {entry.label}: {entry.message}
                </li>
              ))}
            </ul>
          )
        }
      ]
    : [];

  return (
    <div className="onframe-commerce-bulk-status">
      <Alert appearance="soft" tone={status.tone === 'warn' ? 'danger' : 'success'} title={status.message}>
        {!!blockedItems.length && (
          <Accordion items={blockedItems} type="single" ariaLabel="Variações não atualizadas" />
        )}
      </Alert>
    </div>
  );
}

function PriceFeedback({ feedback }) {
  if (!feedback) return null;
  return (
    <Alert appearance="soft" tone={feedback.tone || 'danger'} title={feedback.title || undefined}>
      {feedback.message}
    </Alert>
  );
}

function PriceEditor({ model, actions }) {
  const [draft, setDraft] = useState(model.draft);

  useEffect(() => {
    setDraft(model.draft);
  }, [model.draftKey, model.draft]);

  return (
    <>
      <div className="onframe-commerce-price-editor">
        <Input
          label="Novo preço base"
          startAddon="R$"
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
        {model.canBulk && (
          <div className="onframe-commerce-price-editor-bulk">
            <Checkbox
              checked={model.bulkEnabled}
              disabled={model.busy}
              onChange={actions.onBulkChange}
              label="Aplicar a todas as variações"
              description="Esta aplicação será enviada para as variações ativas e pausadas desta família."
            />
          </div>
        )}
      </div>
      <BulkStatus status={model.bulkStatus} />
    </>
  );
}

function CommercePricePopover({ model, actions }) {
  return (
    <Card padding="var(--ob-space-12)" elevation="shadow">
      <section
        className="onframe-commerce-price-view"
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
            <Alert appearance="soft" tone="danger">
              {model.error}
            </Alert>
            <div className="onframe-commerce-actions">
              <Button kind="primary" size="sm" icon={<Ph n="arrow-clockwise" size={14} />} onClick={actions.onReload}>
                Recarregar
              </Button>
            </div>
          </>
        )}

        {model.mode !== 'loading' && model.mode !== 'error' && model.error && (
          <Alert appearance="soft" tone="danger">
            {model.error}
          </Alert>
        )}

        {model.mode !== 'loading' && model.mode !== 'error' && <PriceFeedback feedback={model.feedback} />}

        {model.mode === 'summary' && <PriceSummary model={model} actions={actions} />}

        {model.mode === 'edit' && (
          <>
            <PriceEditor model={model} actions={actions} />
            <div className="onframe-commerce-popover-edit-footer">
              <Button kind="secondary" size="sm" disabled={model.busy} onClick={actions.onCancel}>
                Descartar
              </Button>
              <Button
                kind="primary"
                size="sm"
                disabled={model.busy}
                icon={model.busy ? <Spinner size="xs" label={model.saveLabel} /> : <Ph n="check-circle" size={14} />}
                onClick={actions.onSave}
              >
                {model.saveLabel}
              </Button>
            </div>
          </>
        )}
      </section>
    </Card>
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
        <CommercePricePopover
          model={model}
          actions={{
            onClose: actions.onClose || (() => {}),
            onReload: actions.onReload || (() => {}),
            onToggleDetails: actions.onToggleDetails || (() => {}),
            onOpenPromotion: actions.onOpenPromotion || (() => {}),
            onEdit: actions.onEdit || (() => {}),
            onDraftChange: actions.onDraftChange || (() => {}),
            onBulkChange: actions.onBulkChange || (() => {}),
            onSave: actions.onSave || (() => {}),
            onCancel: actions.onCancel || (() => {})
          }}
        />
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
