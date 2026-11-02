import { Component, useEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { Accordion, Alert, Badge, Button, Card, Ph, ScrollArea, Spinner, Tabs } from '@onblide/ui';

const roots = new WeakMap();

class CommercePromotionsViewBoundary extends Component {
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

function PromotionsHeader({ badge, onClose }) {
  return (
    <header className="onframe-commerce-promotions-view-head">
      <strong>Promoções</strong>
      {badge?.label && <Badge tone={badge.tone} variant="subtle" size="sm">{badge.label}</Badge>}
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

function SummaryTitle({ icon, tone, title, subtitle, status }) {
  return (
    <span className="onframe-commerce-popover-summary-title">
      <span className={`onframe-commerce-popover-summary-icon ${tone}`} aria-hidden="true">
        <Ph n={icon} size={17} />
      </span>
      <span className="onframe-commerce-popover-summary-copy">
        <strong>{title}</strong>
        {subtitle && <span>{subtitle}</span>}
      </span>
      {status?.label && (
        <Badge tone={status.tone} variant="subtle" size="sm" dot>
          {status.label}
        </Badge>
      )}
    </span>
  );
}

function SummaryMetric({ label, value, tone = '' }) {
  if (!value) return null;
  return (
    <span className={`onframe-commerce-popover-summary-metric ${tone}`}>
      <small>{label}</small>
      <strong>{value}</strong>
    </span>
  );
}

function SummaryContext({ children }) {
  return (
    <span className="onframe-commerce-popover-summary-context">
      <Ph n="calendar-blank" size={14} />
      <span>{children}</span>
    </span>
  );
}

function campaignItem(campaign) {
  return {
    id: 'campaign',
    title: (
      <SummaryTitle
        icon="tag"
        tone="campaign"
        title={campaign.label}
        subtitle={campaign.discount}
        status={campaign.status}
      />
    ),
    content: (
      <div className="onframe-commerce-popover-summary-content">
        <div className="onframe-commerce-popover-summary-metrics">
          <SummaryMetric label="Preço final" value={campaign.finalPrice} />
          <SummaryMetric label="Desconto" value={campaign.discount} tone="success" />
          {campaign.financialBenefit && (
            <SummaryMetric
              label={campaign.financialBenefit.label}
              value={campaign.financialBenefit.value}
              tone={campaign.financialBenefit.tone}
            />
          )}
        </div>
        {campaign.financialBenefit?.description && (
          <p className="onframe-commerce-popover-summary-description">{campaign.financialBenefit.description}</p>
        )}
        <SummaryContext>{[campaign.typeLabel, campaign.period].filter(Boolean).join(' · ')}</SummaryContext>
      </div>
    )
  };
}

function couponItem(coupon, applicationLabel, index) {
  return {
    id: `coupon-${index}`,
    title: (
      <SummaryTitle
        icon="ticket"
        tone="coupon"
        title={coupon.label}
        subtitle={coupon.benefit}
        status={coupon.status}
      />
    ),
    content: (
      <div className="onframe-commerce-popover-summary-content">
        <div className="onframe-commerce-popover-summary-metrics coupon">
          <SummaryMetric label="Benefício" value={coupon.benefit} tone="warning" />
          <SummaryMetric label="Condições" value={coupon.terms} />
        </div>
        <SummaryContext>{[applicationLabel, coupon.period].filter(Boolean).join(' · ')}</SummaryContext>
      </div>
    )
  };
}

function paymentItem(payment, index) {
  return {
    id: `payment-${index}`,
    title: (
      <SummaryTitle
        icon="credit-card"
        tone="payment"
        title={payment.label}
        subtitle={payment.benefit || payment.description}
      />
    ),
    content: (
      <div className="onframe-commerce-popover-summary-content">
        <div className="onframe-commerce-popover-summary-metrics payment">
          <SummaryMetric label="Benefício" value={payment.benefit} tone="primary" />
          <SummaryMetric label="Condição" value={payment.description} />
        </div>
      </div>
    )
  };
}

function promotionGroups(model) {
  const groups = [];
  if (model.campaign) {
    groups.push({ id: 'campaigns', label: 'Campanhas', items: [campaignItem(model.campaign)] });
  }
  if (model.coupons.length) {
    groups.push({
      id: 'coupons',
      label: 'Cupons',
      items: model.coupons.map((coupon, index) => couponItem(coupon, model.couponApplicationLabel, index))
    });
  }
  if (model.payments.length) {
    groups.push({
      id: 'payments',
      label: 'Pagamento',
      items: model.payments.map(paymentItem)
    });
  }
  return groups;
}

function EmptyState() {
  return (
    <div className="onframe-commerce-popover-empty">
      <span className="onframe-commerce-popover-summary-icon campaign" aria-hidden="true">
        <Ph n="tag" size={17} />
      </span>
      <span>
        <strong>Nenhuma promoção aplicada</strong>
        <small>Gerencie campanhas e descontos deste anúncio.</small>
      </span>
    </div>
  );
}

function PromotionSummary({ model }) {
  const groups = promotionGroups(model);
  const [activeGroup, setActiveGroup] = useState(groups[0]?.id || '');
  const availableGroupIds = groups.map((group) => group.id).join(':');

  useEffect(() => {
    if (!groups.some((group) => group.id === activeGroup)) {
      setActiveGroup(groups[0]?.id || '');
    }
  }, [availableGroupIds, activeGroup]);

  if (!groups.length) return <EmptyState />;

  const currentGroup = groups.find((group) => group.id === activeGroup) || groups[0];
  const tabs = groups.map((group) => ({ id: group.id, label: group.label }));

  return (
    <div className="onframe-commerce-popover-summary">
      {groups.length > 1 && (
        <div className="onframe-commerce-popover-tabs">
          <Tabs tabs={tabs} active={currentGroup.id} onChange={setActiveGroup} variant="line" size="sm" />
        </div>
      )}
      <ScrollArea maxHeight={318} ariaLabel={`${currentGroup.label} da promoção`}>
        <Accordion
          key={currentGroup.id}
          items={currentGroup.items}
          type="single"
          defaultValue={model.expandCampaign && currentGroup.id === 'campaigns' ? ['campaign'] : []}
          ariaLabel={currentGroup.label}
        />
      </ScrollArea>
    </div>
  );
}

function CommercePromotionsPopover({ model, actions }) {
  return (
    <Card padding={12} elevation="shadow">
      <section
        className="onframe-commerce-promotions-view"
        aria-label="Promoções"
        onClick={(event) => event.stopPropagation()}
      >
        <PromotionsHeader badge={model.badge} onClose={actions.onClose} />

        {model.mode === 'loading' && (
          <div className="onframe-commerce-promotions-view-loading" aria-live="polite">
            <Spinner size="sm" label="Lendo promoções do anúncio" />
            <span>Lendo promoções do anúncio.</span>
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

        {model.mode === 'summary' && (
          <>
            {model.error && <Alert tone="danger">{model.error}</Alert>}
            <PromotionSummary model={model} />
            <div className="onframe-commerce-popover-footer">
              <Button kind="primary" size="sm" icon={<Ph n="tag" size={14} />} onClick={actions.onManage}>
                Gerenciar promoções
              </Button>
            </div>
          </>
        )}
      </section>
    </Card>
  );
}

function getRoot(host) {
  if (!host) throw new Error('Host do popover de promoções indisponível.');
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
      <CommercePromotionsViewBoundary onError={actions.onError || (() => {})}>
        <CommercePromotionsPopover model={model} actions={{
          onClose: actions.onClose || (() => {}),
          onReload: actions.onReload || (() => {}),
          onManage: actions.onManage || (() => {})
        }} />
      </CommercePromotionsViewBoundary>
    );
  });
}

function unmount(host) {
  const root = host && roots.get(host);
  if (!root) return;
  flushSync(() => root.unmount());
  roots.delete(host);
}

globalThis.OnFrameCommercePromotionsView = Object.freeze({ render, unmount });
