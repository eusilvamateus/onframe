import { Component, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import {
  Accordion,
  Alert,
  AlertDialog,
  Badge,
  Button,
  Card,
  Checkbox,
  EmptyState,
  Input,
  Kbd,
  Menu,
  Modal,
  Ph,
  Popover,
  SearchInput,
  Skeleton,
  Spinner,
  Tabs,
  Tooltip,
  useBreakpoint
} from '@onblide/ui';

const roots = new WeakMap();

class PromotionManagerBoundary extends Component {
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

const icon = (name, size = 16) => <Ph n={name} size={size} />;

function StatusBadge({ status }) {
  if (!status) return null;
  const tone =
    status.tone ||
    (status.id === 'active'
      ? 'success'
      : status.id === 'programmed'
        ? 'primary'
        : status.id === 'available'
          ? 'warning'
          : 'neutral');
  return (
    <Badge tone={tone} appearance="soft" size="sm" dot>
      {status.label}
    </Badge>
  );
}

function Result({ row }) {
  if (row.type === 'coupon') {
    return (
      <div className="onframe-promotion-manager-result">
        <span>Compra mínima</span>
        <strong>{row.result.primary || '—'}</strong>
        {row.result.secondary && <small>Desconto máx. {row.result.secondary}</small>}
      </div>
    );
  }
  return (
    <div className="onframe-promotion-manager-result">
      <span>Você recebe</span>
      {row.result.loading ? (
        <Skeleton width={110} height={20} style={{ marginTop: 'var(--ob-space-4)' }} />
      ) : (
        <strong className={row.result.primary ? 'amount' : undefined}>{row.result.primary || '—'}</strong>
      )}
      {row.result.feeReduction ? (
        <small className="fee-reduction">Tarifa reduzida {row.result.feeReduction}</small>
      ) : (
        row.result.secondary && <small>{row.result.secondary}</small>
      )}
    </div>
  );
}

function MarginSummary({ row }) {
  if (row.type === 'coupon') return null;
  return (
    <div className="onframe-promotion-manager-margin-summary">
      <span title="Margem de contribuição">M. de contribuição</span>
      {row.marginSummary.loading ? (
        <Skeleton width={90} height={20} style={{ marginTop: 'var(--ob-space-4)' }} />
      ) : (
        <strong className={row.marginSummary.tone}>{row.marginSummary.percentage || '—'}</strong>
      )}
      {row.marginSummary.amount && <small className={`amount ${row.marginSummary.tone}`}>{row.marginSummary.amount}</small>}
      {row.marginSummary.recommendation && (
        <small className={row.marginSummary.recommendationTone}>{row.marginSummary.recommendation}</small>
      )}
    </div>
  );
}

function NoteRow({ item, row, actions, productEditor, confirm }) {
  const margin = item.label === 'Margem de contribuição';
  const subtotal = item.label === 'Você recebe';
  const priceField = row.showPriceField && item.label === 'Preço promocional';
  const stockField = row.showStockField && item.label === 'Estoque reservado';
  const costField = productEditor && item.label === 'Custo do produto';
  const taxField = productEditor && item.label === 'Impostos';
  const discount = item.label === 'Preço promocional' && row.condition.secondary;
  const operator = margin || subtotal ? '=' : item.label === 'Crédito promocional' ? '+' : String(item.value).startsWith('-') ? '−' : '';
  const description = item.label === 'Impostos'
    ? String(item.description || '').split(' · ')[0].replace(' sobre ', ' do ')
    : item.description;
  const tone = margin && row.marginSummary.tone === 'danger'
    ? 'danger'
    : operator === '−' ? 'deduction' : operator === '+' ? 'addition' : item.tone || '';

  return (
    <div className={`onframe-promotion-manager-note-row${subtotal ? ' subtotal' : ''}${margin ? ' total' : ''}${priceField || stockField || costField ? ' is-editable' : ''} ${tone}`}>
      <span className="onframe-promotion-manager-note-operator" aria-hidden="true">{operator}</span>
      <div className="onframe-promotion-manager-note-copy">
        <span className="onframe-promotion-manager-note-label">{item.label}</span>
        {margin && item.description && !row.result.loading && <span className="onframe-promotion-manager-note-percent">{item.description} do preço promocional</span>}
        {productEditor && (costField || taxField) && <Badge size="sm" appearance="plain" tone="warning" icon="package">Produto</Badge>}
        {discount && !priceField && <small className="discount">{discount}</small>}
        {!margin && !taxField && !(priceField && row.priceHint) && description && <small>{description}</small>}
        {item.listingType && (
          <Badge
            size="sm"
            appearance="plain"
            tone={item.listingType === 'Premium' ? 'warning' : item.listingType === 'Clássico' ? 'primary' : 'neutral'}
            icon={item.listingType === 'Premium' ? 'crown-simple' : 'tag-simple'}
          >
            {item.listingType}
          </Badge>
        )}
        {priceField && row.priceHint && <small className="discount">{row.priceHint}</small>}
        {taxField && (
          <span className="onframe-promotion-manager-note-tax">
            <span className="onframe-promotion-manager-note-tax-field">
              <Input
                aria-label="Alíquota de imposto do produto"
                size="md"
                value={productEditor.taxDraft}
                onChange={(event) => productEditor.onTaxChange(event.target.value)}
                onKeyDown={productEditor.onKeyDown}
                endAddon="%"
                inputMode="decimal"
                error={productEditor.taxError || undefined}
                disabled={productEditor.saving}
              />
            </span>
            <small>sobre o preço promocional</small>
          </span>
        )}
        {item.benefit && <small className="fee-reduction">{item.benefit}</small>}
        {margin && row.marginSummary.recommendation && <small className="below-minimum">{row.marginSummary.recommendation}</small>}
      </div>
      <div className="onframe-promotion-manager-note-value">
        {priceField ? (
          <Input
            aria-label="Preço promocional"
            size="md"
            value={row.draftPrice}
            onChange={(event) => actions.onDraftChange(row.key, 'deal_price', event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                confirm();
              }
            }}
            startAddon="R$"
            inputMode="decimal"
            error={row.priceError || undefined}
            disabled={row.busy}
          />
        ) : stockField ? (
          <Input
            aria-label="Estoque reservado"
            size="md"
            value={row.draftStock}
            onChange={(event) => actions.onDraftChange(row.key, 'stock', event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                confirm();
              }
            }}
            inputMode="numeric"
            error={row.stockError || undefined}
            disabled={row.busy}
          />
        ) : costField ? (
          <Input
            aria-label="Custo do produto"
            size="md"
            value={productEditor.costDraft}
            onChange={(event) => productEditor.onCostChange(event.target.value)}
            onKeyDown={productEditor.onKeyDown}
            startAddon="R$"
            inputMode="decimal"
            error={productEditor.costError || undefined}
            disabled={productEditor.saving}
          />
        ) : (
          row.result.loading ? <Skeleton width={72} height={18} /> : <strong>{item.value}</strong>
        )}
      </div>
    </div>
  );
}

function Calculation({ row, items = row.calculation, actions, productEditor, confirm, includeOfferFields = true }) {
  const lines = [...(items || [])];
  if (includeOfferFields && row.showPriceField && !lines.some((item) => item.label === 'Preço promocional')) {
    lines.unshift({ label: 'Preço promocional', value: row.condition.primary, description: '' });
  }
  if (includeOfferFields && row.showStockField) {
    const priceIndex = lines.findIndex((item) => item.label === 'Preço promocional');
    lines.splice(priceIndex + 1, 0, { label: 'Estoque reservado', value: row.draftStock, description: row.stockHint });
  }
  if (!lines.length) return null;
  return (
    <div className="onframe-promotion-manager-note">
      {lines.map((item, index) => (
        <NoteRow key={`${item.label}-${index}`} item={item} row={row} actions={actions} productEditor={productEditor} confirm={confirm} />
      ))}
    </div>
  );
}

function ContextFeedback({ feedback, className = '' }) {
  if (!feedback) return null;
  return (
    <div className={className}>
      <Alert appearance="soft" tone={feedback.tone || 'danger'} title={feedback.title || undefined}>
        {feedback.message}
      </Alert>
    </div>
  );
}

function BulkReport({ result, preview = false, feedback, onDismiss, className = '' }) {
  if (!result) return null;
  const targets = Array.isArray(result.targets) ? result.targets : [];
  const counts = result.counts || {};
  const tracked = preview || (
    typeof result.id === 'string' &&
    ['queued', 'running', 'confirming', 'completed', 'partial', 'failed'].includes(result.status) &&
    Number.isInteger(counts.total) && counts.total > 0 && targets.length === counts.total
  );
  if (!tracked) return null;
  const groups = preview
    ? [
        { id: 'eligible', label: 'Elegíveis', statuses: ['eligible'] },
        { id: 'blocked', label: 'Não elegíveis', statuses: ['blocked'] }
      ]
    : [
        { id: 'queued', label: 'Em processamento', statuses: ['queued', 'running'] },
        { id: 'applied', label: 'Aplicados', statuses: ['applied'] },
        { id: 'pending', label: 'Aguardando confirmação', statuses: ['pending_confirmation'] },
        { id: 'failed', label: 'Não aplicados', statuses: ['blocked', 'skipped', 'failed', 'unconfirmed'] }
      ];
  const items = groups.map((group) => {
    const entries = targets.filter((target) => group.statuses.includes(target.status));
    return {
      id: group.id,
      title: `${group.label} (${entries.length})`,
      content: (
        <ul className="onframe-commerce-bulk-status-list">
          {entries.map((target) => (
            <li key={`${group.id}:${target.itemId}`}>
              {target.title ? `${target.title} (${target.itemId})` : target.itemId}
              {target.message ? `: ${target.message}` : ''}
            </li>
          ))}
        </ul>
      ),
      count: entries.length
    };
  }).filter((item) => item.count);
  const title = preview
    ? `${counts.eligible || 0} de ${counts.total || targets.length} anúncios elegíveis`
    : result.status === 'queued' || result.status === 'running'
      ? `Aplicando em ${counts.total || targets.length} anúncios`
      : result.status === 'confirming'
        ? 'Aguardando confirmação do Mercado Livre'
        : feedback?.title || (counts.applied
          ? counts.failed || counts.blocked || counts.unconfirmed ? 'Aplicação parcial' : 'Aplicação concluída'
          : 'Nenhum anúncio aplicado');
  const tone = preview
    ? (counts.blocked ? 'warning' : 'info')
    : ['queued', 'running', 'confirming'].includes(result.status)
      ? 'info' : feedback?.tone || (counts.applied
        ? counts.failed || counts.blocked || counts.unconfirmed ? 'warning' : 'success'
        : 'danger');

  return (
    <div className={`onframe-promotion-manager-bulk-report ${className}`}>
      <Alert appearance="soft" tone={tone} title={title}>
        {!preview && <span>{['queued', 'running', 'confirming'].includes(result.status)
          ? `${counts.applied || 0} aplicados; ${counts.queued || 0} em processamento; ${counts.pending || 0} aguardando confirmação.`
          : feedback?.message || `${counts.applied || 0} aplicados; ${counts.pending || 0} aguardando confirmação; ${(counts.failed || 0) + (counts.blocked || 0) + (counts.unconfirmed || 0)} não aplicados.`}</span>}
        {!!items.length && <Accordion items={items} type="multiple" ariaLabel={preview ? 'Prévia por anúncio' : 'Resultado por anúncio'} />}
      </Alert>
      {onDismiss && !['queued', 'running', 'confirming'].includes(result.status) && (
        <Button kind="quiet" size="sm" iconOnly aria-label="Dispensar resultado" icon={icon('x', 14)} onClick={onDismiss} />
      )}
    </div>
  );
}

function decimalInputValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? String(number).replace('.', ',') : '';
}

function parseDecimalValue(value) {
  const text = String(value || '')
    .trim()
    .replace(/\s/gu, '');
  const normalized = text.includes(',') ? text.replace(/\./gu, '').replace(',', '.') : text;
  if (!normalized) return null;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function formatFinancialMoney(value, financials) {
  const decimalPlaces = Number(financials?.costDecimalPlaces);
  const digits = Number.isInteger(decimalPlaces) && decimalPlaces >= 0 && decimalPlaces <= 8 ? decimalPlaces : 2;
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: financials?.currency || 'BRL',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  }).format(Number(value) || 0);
}

function formatFinancialPercent(value) {
  return `${Number(value).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;
}

function financialSnapshot(financials, productCost, taxRate) {
  if (!financials || productCost === null || taxRate === null) return null;
  const salePriceCents = Math.round(financials.salePrice * 100);
  const taxRateBps = Math.round(taxRate * 100);
  const taxAmount = Math.round((salePriceCents * taxRateBps) / 10_000) / 100;
  const amount = financials.youReceive - productCost - taxAmount - financials.customCost;
  return {
    productCost,
    taxRate,
    taxAmount,
    amount,
    percentage: financials.salePrice ? (amount / financials.salePrice) * 100 : 0
  };
}

function adjustedCalculation(row, snapshot) {
  if (!snapshot) return row.calculation;
  return row.calculation.map((item) => {
    if (item.label === 'Custo do produto') {
      return { ...item, value: `-${formatFinancialMoney(snapshot.productCost, row.productFinancials)}` };
    }
    if (item.label === 'Impostos') {
      const source = item.description.includes(' · ') ? ` · ${item.description.split(' · ').slice(1).join(' · ')}` : '';
      return {
        ...item,
        value: `-${formatFinancialMoney(snapshot.taxAmount, row.productFinancials)}`,
        description: `${formatFinancialPercent(snapshot.taxRate)} sobre o preço promocional${source}`
      };
    }
    if (item.label === 'Margem de contribuição') {
      return {
        ...item,
        value: formatFinancialMoney(snapshot.amount, row.productFinancials),
        description: formatFinancialPercent(snapshot.percentage),
        tone: snapshot.amount >= 0 ? 'success' : 'danger'
      };
    }
    return item;
  });
}

function PromotionFinancialDetails({ row, actions, confirm, editing, onCancel }) {
  const lastReady = useRef(null);
  if (row.productFinancials && row.calculation.length) {
    lastReady.current = { productFinancials: row.productFinancials, calculation: row.calculation };
  }
  const displayRow = row.result.loading && lastReady.current ? { ...row, ...lastReady.current } : row;
  const financials = displayRow.productFinancials;
  const [draftProductId, setDraftProductId] = useState(financials?.productId || '');
  const [costDraft, setCostDraft] = useState(() => decimalInputValue(financials?.productCost));
  const [taxDraft, setTaxDraft] = useState(() => decimalInputValue(financials?.taxRate));

  useEffect(() => {
    if (!financials || (editing && draftProductId === financials.productId)) return;
    setDraftProductId(financials.productId);
    setCostDraft(decimalInputValue(financials.productCost));
    setTaxDraft(decimalInputValue(financials.taxRate));
  }, [financials?.productId, financials?.productCost, financials?.taxRate, editing, draftProductId]);

  const productCost = parseDecimalValue(costDraft);
  const taxRate = parseDecimalValue(taxDraft);
  const snapshot = financialSnapshot(financials, productCost, taxRate);
  const calculation = adjustedCalculation(displayRow, snapshot);
  const productEditor = editing && financials
    ? {
        costDraft,
        taxDraft,
        costError: productCost === null || productCost < 0 ? 'Informe um custo válido.' : '',
        taxError: taxRate === null || taxRate < 0 || taxRate > 100 ? 'Informe uma alíquota entre 0% e 100%.' : '',
        saving: row.busy,
        onCostChange: setCostDraft,
        onTaxChange: setTaxDraft,
        onKeyDown: (event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            onCancel();
          } else if (event.key === 'Enter') {
            event.preventDefault();
          }
        }
      }
    : null;

  return (
    <div className={`onframe-promotion-manager-note-layout ${editing ? 'is-editing' : 'is-reading'}`}>
      {displayRow.result.loading && !calculation.length && (
        <div className="onframe-promotion-manager-note-loading">
          <Skeleton width="100%" height={48} radius="var(--ob-r-xs)" />
          <Skeleton width="100%" height={48} radius="var(--ob-r-xs)" />
        </div>
      )}
      {!displayRow.result.loading && !calculation.length && displayRow.result.secondary && (
        <Alert appearance="soft" tone="warning">{displayRow.result.secondary}</Alert>
      )}
      <Calculation row={displayRow} items={calculation} actions={actions} productEditor={productEditor} confirm={confirm} />
      {displayRow.margin && !displayRow.margin.available && (
        <Alert appearance="soft" tone="info">{displayRow.margin.message}</Alert>
      )}
    </div>
  );
}

function CouponNote({ row }) {
  const items = [
    { label: 'Desconto', value: row.condition.primary, description: 'sobre o total da compra' },
    { label: 'Compra mínima', value: row.result.primary, description: '' },
    ...(row.result.secondary ? [{ label: 'Desconto máximo', value: row.result.secondary, description: '' }] : [])
  ];
  return <Calculation row={row} items={items} includeOfferFields={false} />;
}

function EditPanel({ row, actions, simulatingFinancials, setSimulatingFinancials }) {
  const editing = !row.readOnly || simulatingFinancials;
  const cancel = () => {
    if (row.formAction === 'update') actions.onCancelChanges();
    else if (row.formAction === 'create') actions.onCancelEdit();
    else setSimulatingFinancials(false);
  };
  const confirm = () => {
    if (row.offerDirty && !row.validationError && !row.bulkError && !row.busy) actions.onConfirm(row.key, row.formAction);
  };

  return (
    <>
      <ContextFeedback feedback={row.feedback} className="onframe-promotion-manager-editor-feedback" />
      <div className={`onframe-promotion-manager-editor${row.readOnly ? ' is-readonly' : ''}`}>
        {row.type === 'coupon' ? (
          <CouponNote row={row} />
        ) : (
          <PromotionFinancialDetails
            row={row}
            actions={actions}
            confirm={confirm}
            editing={editing}
            onCancel={cancel}
          />
        )}
      </div>
      {row.bulkEnabled && row.bulkError && (
        <div className="onframe-promotion-manager-bulk-error">
          <Alert appearance="soft" tone="danger">{row.bulkError}</Alert>
        </div>
      )}
      {row.bulkEnabled && row.bulkPreview && <BulkReport result={row.bulkPreview} preview className="in-editor" />}
      <div className={`onframe-promotion-manager-footer-shell${editing ? ' is-visible' : ''}`} aria-hidden={!editing}>
        <div className="onframe-promotion-manager-footer-content">
          <div className="onframe-promotion-manager-editor-footer">
            {!row.readOnly && row.type !== 'coupon' && row.canBulk && (
              <div className="onframe-promotion-manager-bulk">
                <Checkbox
                  checked={row.bulkEnabled}
                  onChange={actions.onToggleBulk}
                  disabled={!editing || row.busy}
                  label="Aplicar a outros anúncios da família"
                  description="Inclui anúncios ativos e pausados que aceitarem esta oferta."
                />
              </div>
            )}
            <div className="onframe-promotion-manager-shortcuts" aria-label="Atalhos de teclado">
              <span>
                <Kbd size="sm">Esc</Kbd> cancela
              </span>
              {!row.readOnly && <span><Kbd size="sm">Enter</Kbd> confirma a promoção</span>}
            </div>
            <div className="onframe-promotion-manager-editor-actions">
              <Button kind="quiet" tone="danger" size="sm" onClick={cancel} disabled={!editing || row.busy}>
                Cancelar
              </Button>
              {!row.readOnly && (
                <Button
                  kind="primary"
                  size="sm"
                  icon={icon('check-circle')}
                  disabled={!editing || !row.offerDirty || Boolean(row.validationError || row.bulkError) || row.busy}
                  onClick={confirm}
                >
                  {row.formAction === 'update' && !row.bulkEnabled ? 'Salvar promoção' : row.confirmLabel}
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function CardActions({ row, actions, simulatingFinancials, setSimulatingFinancials }) {
  const isCoupon = row.type === 'coupon';
  const showEditLabel = useBreakpoint().atLeast('sm');
  const editing = row.formOpen && (!row.readOnly || simulatingFinancials);
  const canEdit = row.canUpdate || (!isCoupon && row.productFinancials);
  const startEditing = () => row.canUpdate ? actions.onOpen(row.key, 'update') : setSimulatingFinancials(true);
  const items = row.formOpen
    ? [
        ...(row.readOnly && !simulatingFinancials && canEdit
          ? [{
              label: 'Editar',
              icon: 'pencil-simple',
              disabled: row.busy,
              onSelect: startEditing
            }]
          : []),
        {
          label: 'Recolher detalhes',
          icon: 'caret-up',
          disabled: row.busy,
          onSelect: actions.onCancelEdit
        }
      ]
    : row.group === 'available'
      ? [
          ...(row.createAction
            ? [{
                label: 'Aplicar',
                icon: 'check-circle',
                disabled: row.busy,
                onSelect: () => row.canQuickApply
                  ? actions.onQuickApply(row.key)
                  : actions.onOpen(row.key, 'create')
              }]
            : []),
          ...(row.canQuickApply || !row.createAction
            ? [{
                label: isCoupon ? 'Revisar' : 'Configurar',
                icon: isCoupon ? 'clipboard-text' : 'tag',
                disabled: row.busy,
                onSelect: () => actions.onOpen(row.key, row.createAction ? 'create' : 'details')
              }]
            : [])
        ]
      : [
          ...(row.canUpdate
            ? [{ label: 'Editar', icon: 'pencil-simple', disabled: row.busy, onSelect: () => actions.onOpen(row.key, 'update') }]
            : []),
          { label: 'Ver detalhes', icon: 'eye', disabled: row.busy, onSelect: () => actions.onOpen(row.key, 'details') },
          ...(row.canDelete
            ? [
                { type: 'separator' },
                { label: 'Remover', icon: 'trash', tone: 'danger', disabled: row.busy, onSelect: () => actions.onRemove(row.key) }
              ]
            : [])
        ];
  return (
    <>
      {row.formOpen && (!editing || showEditLabel) && (
        <span className="onframe-promotion-manager-direct-actions">
          {editing ? (
            <Badge size="sm" tone="primary" appearance="plain" icon="pencil-simple">Editando</Badge>
          ) : (
            <>
              {canEdit && (
                <Button
                  kind="quiet"
                  tone="primary"
                  size="sm"
                  iconOnly={!showEditLabel}
                  aria-label="Editar"
                  icon={icon('pencil-simple', 14)}
                  disabled={row.busy}
                  onClick={startEditing}
                >
                  Editar
                </Button>
              )}
              <Button
                kind="neutral"
                size="sm"
                iconOnly
                aria-label="Recolher detalhes"
                icon={icon('caret-up', 16)}
                disabled={row.busy}
                onClick={actions.onCancelEdit}
              />
            </>
          )}
        </span>
      )}
      <Menu
        size="md"
        align="right"
        placement="auto"
        ariaLabel={`Ações de ${row.name}`}
        items={items}
        trigger={
          <Button
            kind="quiet"
            size="sm"
            iconOnly
            aria-label={`Abrir ações de ${row.name}`}
            icon={icon('dots-three-vertical', 18)}
            disabled={row.busy}
          />
        }
      />
    </>
  );
}

function PromotionCard({ row, actions }) {
  const [simulatingFinancials, setSimulatingFinancials] = useState(false);
  const [panelMounted, setPanelMounted] = useState(row.formOpen);
  const lastOpenRow = useRef(row);
  if (row.formOpen) lastOpenRow.current = row;

  useEffect(() => {
    if (row.formOpen) setSimulatingFinancials(false);
  }, [row.formOpen, row.formAction]);

  useEffect(() => {
    if (row.formOpen) {
      setPanelMounted(true);
    } else if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setPanelMounted(false);
      setSimulatingFinancials(false);
    }
  }, [row.formOpen]);

  const expanded = row.formOpen || panelMounted;
  const panelRow = row.formOpen ? row : lastOpenRow.current;

  return (
    <Card
      padding={0}
      style={{
        overflow: expanded ? 'hidden' : 'visible',
        borderColor: row.formOpen ? 'var(--ob-blue)' : 'var(--ob-line-soft)',
        transition: 'border-color var(--ob-dur-base) var(--ob-ease)'
      }}
    >
      <div className={`onframe-promotion-manager-card${row.formOpen ? ' is-open' : ''}`}>
        <div className="onframe-promotion-manager-name">
          <span className={`onframe-commerce-promotion-type-icon ${row.type}`} aria-hidden="true">
            <Ph n={row.type === 'coupon' ? 'ticket' : row.type === 'payment' ? 'credit-card' : 'tag'} size={20} />
          </span>
          <div>
            <strong>
              {row.name}
              <StatusBadge status={row.status} />
            </strong>
            <div className="onframe-promotion-manager-meta">
              <small>{row.typeLabel}</small>
              <small>{row.period}</small>
            </div>
          </div>
        </div>
        <div className={`onframe-promotion-manager-summary-shell${row.formOpen ? ' is-collapsed' : ''}`} aria-hidden={row.formOpen}>
          <div className="onframe-promotion-manager-summary-content">
            <div className="onframe-promotion-manager-condition">
              <span>{row.type === 'coupon' ? 'Desconto' : row.type === 'payment' ? 'Condição' : 'Preço'}</span>
              <strong>{row.condition.primary || '—'}</strong>
              {row.condition.secondary && <small>{row.condition.secondary}</small>}
            </div>
            <Result row={row} />
            <MarginSummary row={row} />
          </div>
        </div>
        <div className="onframe-promotion-manager-actions">
          <CardActions row={expanded ? panelRow : row} actions={actions} simulatingFinancials={simulatingFinancials} setSimulatingFinancials={setSimulatingFinancials} />
        </div>
      </div>
      {!expanded && <ContextFeedback feedback={row.feedback} className="onframe-promotion-manager-card-feedback" />}
      <div
        className={`onframe-promotion-manager-panel-shell${row.formOpen ? ' is-expanded' : ''}`}
        aria-hidden={!row.formOpen}
        ref={(element) => {
          if (element) element.inert = !row.formOpen;
        }}
        onTransitionEnd={(event) => {
          if (event.target === event.currentTarget && event.propertyName === 'grid-template-rows' && !row.formOpen) {
            setPanelMounted(false);
            setSimulatingFinancials(false);
          }
        }}
      >
        <div className="onframe-promotion-manager-panel-content">
          {(row.formOpen || panelMounted) && (
            <EditPanel row={panelRow} actions={actions} simulatingFinancials={simulatingFinancials} setSimulatingFinancials={setSimulatingFinancials} />
          )}
        </div>
      </div>
    </Card>
  );
}

const sectionDefinitions = [
  { id: 'applied', title: 'Aplicadas ao anúncio', description: 'O que está valendo agora para este anúncio.' },
  { id: 'available', title: 'Disponíveis para aplicar', description: 'Escolha o que aplicar a este anúncio.' }
];

const promotionTypeDefinitions = [
  { id: 'campaign', title: 'Campanhas', description: 'Participe para entrar na vitrine da campanha.' },
  { id: 'coupon', title: 'Cupons', description: 'Desconto aplicado sobre o total da compra.' },
  { id: 'direct', title: 'Descontos diretos', description: 'Desconto configurado diretamente no anúncio.' },
  { id: 'payment', title: 'Descontos por pagamento', description: 'Benefício condicionado à forma de pagamento.' }
];

function PromotionSection({ definition, rows, actions }) {
  if (!rows.length) return null;
  const types = promotionTypeDefinitions.filter((type) => rows.some((row) => row.type === type.id));
  return (
    <section className="onframe-promotion-manager-section">
      <h2>
        {definition.title}
        <Badge tone="neutral" variant="numeric" size="sm">
          {rows.length}
        </Badge>
      </h2>
      <p>{definition.description}</p>
      {types.map((type) => (
        <div className="onframe-promotion-manager-subgroup" key={type.id}>
          {types.length > 1 && (
            <h3>
              {type.title}
              <span>{type.description}</span>
            </h3>
          )}
          <div className="onframe-promotion-manager-list">
            {rows
              .filter((row) => row.type === type.id)
              .map((row) => (
                <PromotionCard key={row.key} row={row} actions={actions} />
              ))}
          </div>
        </div>
      ))}
    </section>
  );
}

function HeaderTitle() {
  return (
    <div className="onframe-promotion-manager-title">
      <span>ONFRAME</span>
      <strong>Promoções</strong>
      <small>Controle ofertas e campanhas deste anúncio.</small>
    </div>
  );
}

function PromotionManager({ model, actions }) {
  const tabs = [
    { id: 'all', label: 'Todas' },
    { id: 'campaign', label: 'Campanhas' },
    { id: 'coupon', label: 'Cupons' }
  ];
  const filterCount = model.statusFilters.length + model.typeFilters.length + model.financialFilters.length;
  const removalRow = model.removalKey ? model.rows.find((row) => row.key === model.removalKey) : null;

  return (
    <>
      <Modal
        open
        onClose={removalRow ? actions.onCancelRemove : model.openKey ? actions.onCancelEdit : actions.onClose}
        title={<HeaderTitle />}
        width={1080}
        maxHeight="min(88vh, 900px)"
        footer={
          <Button kind="neutral" onClick={actions.onClose}>
            Fechar
          </Button>
        }
      >
        <div className="onframe-promotion-manager">
          <div className="onframe-promotion-manager-toolbar">
            <div className="onframe-promotion-manager-toolbar-line">
              <Tabs tabs={tabs} active={model.tab} onChange={actions.onTabChange} variant="pill" size="sm" />
              <div className="onframe-promotion-manager-toolbar-actions">
                <Tooltip
                  label={model.loading ? 'Atualizando…' : 'Atualizado agora · clique para atualizar'}
                  placement="bottom"
                >
                  <Button
                    kind="neutral"
                    size="sm"
                    iconOnly
                    aria-label="Atualizar promoções"
                    icon={icon(model.loading ? 'circle-notch' : 'arrow-clockwise', 18)}
                    onClick={actions.onReload}
                    disabled={model.loading}
                  />
                </Tooltip>
                {model.canCreateDiscount && (
                  <Button
                    kind="primary"
                    size="sm"
                    icon={icon('tag', 18)}
                    onClick={actions.onCreateDiscount}
                    disabled={model.busy}
                  >
                    Criar desconto
                  </Button>
                )}
              </div>
            </div>
            <div className="onframe-promotion-manager-search-line">
              <div className="onframe-promotion-manager-search">
                <SearchInput
                  width="100%"
                  value={model.search}
                  onChange={actions.onSearchChange}
                  placeholder="Buscar promoção ou cupom…"
                  ariaLabel="Buscar promoção ou cupom"
                />
              </div>
              <div className="onframe-promotion-manager-filter-controls">
                <Popover
                  trigger={
                    <Button
                      kind="secondary"
                      icon={icon('sliders-horizontal', 18)}
                      count={filterCount || undefined}
                      countTone="primary"
                    >
                      Filtros
                    </Button>
                  }
                  title="Filtrar promoções"
                  width={280}
                  align="start"
                  footer={
                    filterCount ? (
                      <Button kind="ghost" size="sm" onClick={actions.onClearAdvancedFilters}>
                        Limpar filtros
                      </Button>
                    ) : undefined
                  }
                >
                  <div className="onframe-promotion-manager-filter-group">
                    <strong>Estado</strong>
                    <Checkbox
                      checked={model.statusFilters.includes('active')}
                      onChange={() => actions.onToggleStatus('active')}
                      label="Ativas"
                    />
                    <Checkbox
                      checked={model.statusFilters.includes('programmed')}
                      onChange={() => actions.onToggleStatus('programmed')}
                      label="Programadas"
                    />
                    <Checkbox
                      checked={model.statusFilters.includes('available')}
                      onChange={() => actions.onToggleStatus('available')}
                      label="Elegíveis"
                    />
                  </div>
                  <div className="onframe-promotion-manager-filter-group">
                    <strong>Tipo</strong>
                    <Checkbox
                      checked={model.typeFilters.includes('direct')}
                      onChange={() => actions.onToggleType('direct')}
                      label="Descontos diretos"
                    />
                    <Checkbox
                      checked={model.typeFilters.includes('payment')}
                      onChange={() => actions.onToggleType('payment')}
                      label="Descontos por pagamento"
                    />
                  </div>
                  <div className="onframe-promotion-manager-filter-group">
                    <strong>Financeiro</strong>
                    <Checkbox
                      checked={model.financialFilters.includes('fee_reduction')}
                      onChange={() => actions.onToggleFinancial('fee_reduction')}
                      label="Com redução de tarifa"
                    />
                  </div>
                </Popover>
              </div>
            </div>
          </div>

          {model.error && (
            <div className="onframe-promotion-manager-alert">
              <Alert appearance="soft" tone="danger">
                {model.error}
              </Alert>
            </div>
          )}

          {!model.bulkResult && <ContextFeedback feedback={model.feedback} className="onframe-promotion-manager-alert" />}
          {model.bulkResult && (
            <BulkReport result={model.bulkResult} feedback={model.feedback} onDismiss={actions.onDismissBulkResult} />
          )}

          <div className="onframe-promotion-manager-content">
            {model.loading && !model.rows.length ? (
              <div className="onframe-promotion-manager-loading">
                <Spinner size="sm" label="Lendo promoções do anúncio" />
                <span>Lendo promoções do anúncio.</span>
              </div>
            ) : !model.rows.length ? (
              <EmptyState
                icon="magnifying-glass"
                title="Nenhuma promoção encontrada"
                description="Tente outro nome ou limpe a busca e os filtros."
                action={
                  <Button kind="secondary" size="sm" onClick={actions.onClearFilters}>
                    Limpar filtros
                  </Button>
                }
              />
            ) : (
              sectionDefinitions.map((definition) => (
                <PromotionSection
                  key={definition.id}
                  definition={definition}
                  rows={model.rows.filter((row) => row.group === definition.id)}
                  actions={actions}
                />
              ))
            )}
          </div>
        </div>
      </Modal>
      <AlertDialog
        open={Boolean(removalRow)}
        onClose={actions.onCancelRemove}
        title="Remover promoção?"
        confirmLabel="Remover promoção"
        cancelLabel="Cancelar"
        onConfirm={() => removalRow && actions.onConfirmRemove(removalRow.key)}
        tone="danger"
      >
        {removalRow
          ? `${removalRow.name} deixará de participar deste anúncio. Você poderá aplicá-la novamente enquanto ela continuar disponível.`
          : null}
      </AlertDialog>
    </>
  );
}

function getRoot(host) {
  if (!host) throw new Error('Host do gerenciador de promoções indisponível.');
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
      <PromotionManagerBoundary onError={actions.onError || (() => {})}>
        <PromotionManager model={model} actions={actions} />
      </PromotionManagerBoundary>
    );
  });
}

function unmount(host) {
  const root = host && roots.get(host);
  if (!root) return;
  flushSync(() => root.unmount());
  roots.delete(host);
}

globalThis.OnFrameCommercePromotionManagerView = Object.freeze({ render, unmount });
