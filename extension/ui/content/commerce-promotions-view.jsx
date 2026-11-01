import { Component } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { Alert, Badge, Button, Card, Ph, Spinner, Tooltip } from '@onblide/ui';

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
      {badge?.label && <Badge tone={badge.tone} size="sm">{badge.label}</Badge>}
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

function CompactValue({ value, description }) {
  if (!description) return <strong>{value}</strong>;
  return (
    <span className="onframe-commerce-promotions-view-tooltip">
      <Tooltip label={description} placement="bottom">
        <strong tabIndex={0}>{value}</strong>
      </Tooltip>
    </span>
  );
}

function CampaignSummary({ campaign }) {
  if (!campaign) return null;
  const fields = [
    { label: 'Promoção', value: campaign.label, className: 'name' },
    { label: 'Estado e vigência', value: campaign.period, description: campaign.period, className: 'period', badge: campaign.status },
    { label: 'Desconto', value: campaign.discount },
    { label: 'Preço final', value: campaign.finalPrice }
  ];
  if (campaign.financialBenefit) {
    fields.push({
      label: campaign.financialBenefit.label,
      value: campaign.financialBenefit.value,
      description: campaign.financialBenefit.description,
      className: `financial ${campaign.financialBenefit.tone || ''}`
    });
  }

  return (
    <div className="onframe-commerce-popover-campaign">
      <Card padding={0}>
        <div className={`onframe-commerce-popover-campaign-grid${campaign.financialBenefit ? ' with-benefit' : ''}`}>
          {fields.map((field) => (
            <div className={`onframe-commerce-popover-campaign-field ${field.className || ''}`} key={field.label}>
              <small>{field.label}</small>
              <CompactValue value={field.value} description={field.description} />
              {field.badge && (
                <span className="onframe-commerce-promotions-view-badge">
                  <Badge tone={field.badge.tone} size="sm">{field.badge.label}</Badge>
                </span>
              )}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function CouponList({ coupons, applicationLabel }) {
  if (!coupons.length) return null;
  return (
    <section className="onframe-commerce-popover-coupon-list" aria-label="Cupons do vendedor">
      <Card padding={0}>
        <div className="onframe-commerce-popover-coupon-list-head">
          <small>Cupons do vendedor</small>
          <span>{applicationLabel}</span>
        </div>
        <div className="onframe-commerce-popover-coupon-list-rows">
          {coupons.map((coupon, index) => (
            <div className="onframe-commerce-popover-coupon-row" key={`${coupon.label}:${index}`}>
              <span className="onframe-commerce-popover-coupon-icon" aria-hidden="true"><Ph n="ticket" size={14} /></span>
              <strong className="onframe-commerce-popover-coupon-name" title={coupon.label}>{coupon.label}</strong>
              <span className="onframe-commerce-popover-coupon-period" title={coupon.period}>{coupon.period}</span>
              <strong className="onframe-commerce-popover-coupon-benefit">{coupon.benefit}</strong>
              <span className="onframe-commerce-popover-coupon-terms" title={coupon.terms}>{coupon.terms}</span>
              <span className="onframe-commerce-popover-coupon-badge">
                <Badge tone={coupon.status.tone} size="sm">{coupon.status.label}</Badge>
              </span>
            </div>
          ))}
        </div>
      </Card>
    </section>
  );
}

function PaymentList({ payments }) {
  if (!payments.length) return null;
  return (
    <section className="onframe-commerce-popover-conditions payment" aria-label="Descontos por pagamento">
      <div className="onframe-commerce-popover-conditions-head"><small>Descontos por pagamento</small></div>
      <div className="onframe-commerce-popover-condition-list">
        {payments.map((payment, index) => (
          <div className="onframe-commerce-popover-condition-card" key={`${payment.label}:${index}`}>
            <Card padding={0}>
              <div className="onframe-commerce-popover-condition payment">
                <span className="onframe-commerce-popover-condition-icon" aria-hidden="true"><Ph n="credit-card" size={14} /></span>
                <div>
                  <strong>{payment.label}</strong>
                  <span>{payment.description}</span>
                </div>
                {payment.benefit && <b>{payment.benefit}</b>}
              </div>
            </Card>
          </div>
        ))}
      </div>
    </section>
  );
}

function EmptyState() {
  return (
    <div className="onframe-commerce-popover-empty-wrap">
      <Card padding={0}>
        <div className="onframe-commerce-popover-empty">
          <div>
            <small>Promoções</small>
            <strong>Nenhuma promoção aplicada</strong>
          </div>
          <span>Gerencie campanhas e descontos deste anúncio.</span>
        </div>
      </Card>
    </div>
  );
}

function CommercePromotionsPopover({ model, actions }) {
  return (
    <section
      className="onframe-commerce-popover onframe-commerce-promotions-view"
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
          <CampaignSummary campaign={model.campaign} />
          <CouponList coupons={model.coupons} applicationLabel={model.couponApplicationLabel} />
          {model.empty && <EmptyState />}
          <PaymentList payments={model.payments} />
          <div className="onframe-commerce-actions">
            <Button kind="primary" size="sm" icon={<Ph n="tag" size={14} />} onClick={actions.onManage}>
              Gerenciar promoções
            </Button>
          </div>
        </>
      )}
    </section>
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
