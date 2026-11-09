import { Component, useEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import {
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
  Tooltip
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

function Metric({ label, value, tone = '' }) {
  if (!value) return null;
  return (
    <div className={`onframe-promotion-manager-metric ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Result({ row }) {
  if (row.type === 'coupon') {
    return (
      <div className="onframe-promotion-manager-result">
        <span>Compra mínima</span>
        <strong>{row.result.primary || '—'}</strong>
        {row.result.secondary && <small>Reembolso máx. {row.result.secondary}</small>}
      </div>
    );
  }
  return (
    <div className="onframe-promotion-manager-result">
      <span>Você recebe</span>
      {row.result.loading ? (
        <Skeleton width={110} height={20} style={{ marginTop: 'var(--ob-space-4)' }} />
      ) : (
        <strong>{row.result.primary || '—'}</strong>
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
      {row.marginSummary.amount && <small>{row.marginSummary.amount}</small>}
    </div>
  );
}

function Calculation({ row, items = row.calculation }) {
  if (!items?.length) return null;
  return (
    <div>
      <div className="onframe-promotion-manager-kicker">Como o valor é calculado</div>
      <div className="onframe-promotion-manager-calculation">
        {items.map((item, index) => (
          <div key={`${item.label}-${index}`} className={item.tone || ''}>
            <span>
              {item.label}
              {item.description && <small>{item.description}</small>}
              {item.benefit && <small className="fee-reduction">{item.benefit}</small>}
            </span>
            <strong>{item.value}</strong>
          </div>
        ))}
      </div>
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

function PromotionFinancialDetails({ row, actions, confirm }) {
  const financials = row.productFinancials;
  const [editingFinancials, setEditingFinancials] = useState(false);
  const [costDraft, setCostDraft] = useState(() => decimalInputValue(financials?.productCost));
  const [taxDraft, setTaxDraft] = useState(() => decimalInputValue(financials?.taxRate));
  const [savingFinancials, setSavingFinancials] = useState(false);
  const [financialError, setFinancialError] = useState('');

  useEffect(() => {
    setCostDraft(decimalInputValue(financials?.productCost));
    setTaxDraft(decimalInputValue(financials?.taxRate));
    setFinancialError('');
  }, [financials?.productId, financials?.productCost, financials?.taxRate]);

  const productCost = parseDecimalValue(costDraft);
  const taxRate = parseDecimalValue(taxDraft);
  const costError = productCost === null || productCost < 0 ? 'Informe um custo válido.' : '';
  const taxError = taxRate === null || taxRate < 0 || taxRate > 100 ? 'Informe uma alíquota entre 0% e 100%.' : '';
  const snapshot = financialSnapshot(financials, productCost, taxRate);
  const calculation = adjustedCalculation(row, snapshot);
  const dirty = Boolean(
    financials &&
    snapshot &&
    (snapshot.productCost !== financials.productCost || snapshot.taxRate !== financials.taxRate)
  );
  const canSaveFinancials = dirty && !costError && !taxError && !savingFinancials;

  const discardFinancials = () => {
    setCostDraft(decimalInputValue(financials?.productCost));
    setTaxDraft(decimalInputValue(financials?.taxRate));
    setFinancialError('');
    setEditingFinancials(false);
  };

  const saveFinancials = async () => {
    if (!canSaveFinancials || !financials) return;
    const changes = {};
    if (snapshot.productCost !== financials.productCost) changes.cost = snapshot.productCost;
    if (snapshot.taxRate !== financials.taxRate) changes.taxRate = snapshot.taxRate;
    setSavingFinancials(true);
    setFinancialError('');
    const result = await actions.onSaveProductFinancials(row.key, changes);
    setSavingFinancials(false);
    if (!result?.ok) {
      setFinancialError(result?.error || 'Não foi possível salvar os dados do produto.');
      return;
    }
    setEditingFinancials(false);
  };

  const handleFinancialKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      discardFinancials();
    } else if (event.key === 'Enter' && canSaveFinancials) {
      event.preventDefault();
      event.stopPropagation();
      void saveFinancials();
    }
  };

  return (
    <>
      <div className="onframe-promotion-manager-financial-side">
        {row.showPriceField && (
          <Input
            label="Preço promocional"
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
            hint={row.priceHint || undefined}
            disabled={row.busy || row.readOnly}
          />
        )}
        {row.showStockField && (
          <Input
            label="Estoque reservado"
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
            hint={row.stockHint || undefined}
            disabled={row.busy || row.readOnly}
          />
        )}

        {financials && snapshot ? (
          <div className={`onframe-promotion-manager-financial${editingFinancials ? ' is-editing' : ''}`}>
            {editingFinancials ? (
              <div className="onframe-promotion-manager-financial-edit" onKeyDown={handleFinancialKeyDown}>
                <div>
                  <span className="onframe-promotion-manager-kicker">Dados do cálculo</span>
                  <strong>Premissas do produto</strong>
                </div>
                <Input
                  label="Custo do produto"
                  value={costDraft}
                  onChange={(event) => setCostDraft(event.target.value)}
                  startAddon="R$"
                  inputMode="decimal"
                  error={costError || undefined}
                  hint="Valor cadastrado no OnFrame"
                  disabled={savingFinancials}
                />
                <Input
                  label="Imposto"
                  value={taxDraft}
                  onChange={(event) => setTaxDraft(event.target.value)}
                  endAddon="%"
                  inputMode="decimal"
                  error={taxError || undefined}
                  hint="Calculado sobre o preço promocional"
                  disabled={savingFinancials}
                />
                {financialError && (
                  <Alert appearance="soft" tone="danger">
                    {financialError}
                  </Alert>
                )}
                <div className="onframe-promotion-manager-financial-actions">
                  <span>{dirty ? 'Alterações não salvas' : 'Sem alterações'}</span>
                  <div>
                    <Button kind="neutral" size="sm" onClick={discardFinancials} disabled={savingFinancials}>
                      Descartar
                    </Button>
                    <Button
                      kind="primary"
                      size="sm"
                      onClick={() => void saveFinancials()}
                      disabled={!canSaveFinancials}
                    >
                      {savingFinancials ? 'Salvando…' : 'Salvar no produto'}
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="onframe-promotion-manager-financial-summary">
                <div className="onframe-promotion-manager-financial-heading">
                  <div>
                    <span className="onframe-promotion-manager-kicker">Resultado</span>
                    <strong>Resumo financeiro</strong>
                  </div>
                  {financials.canEdit && (
                    <Tooltip label="Editar dados do cálculo" placement="left">
                      <Button
                        kind="quiet"
                        size="sm"
                        iconOnly
                        aria-label="Editar dados do cálculo"
                        icon={icon('pencil-simple')}
                        onClick={() => setEditingFinancials(true)}
                      />
                    </Tooltip>
                  )}
                </div>
                <div className="onframe-promotion-manager-financial-values">
                  <Metric label="Você recebe" value={formatFinancialMoney(financials.youReceive, financials)} />
                  <Metric label="Custo do produto" value={formatFinancialMoney(snapshot.productCost, financials)} />
                  <Metric label="Impostos" value={formatFinancialMoney(snapshot.taxAmount, financials)} />
                </div>
                <div className={`onframe-promotion-manager-financial-margin ${snapshot.amount < 0 ? 'danger' : ''}`}>
                  <span>Margem de contribuição</span>
                  <strong>{formatFinancialPercent(snapshot.percentage)}</strong>
                  <small>{formatFinancialMoney(snapshot.amount, financials)}</small>
                </div>
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="onframe-promotion-manager-editor-metrics">
              {row.result.loading
                ? [0, 1, 2].map((item) => <Skeleton key={item} width="72%" height={38} radius="var(--ob-r-xs)" />)
                : row.metrics.map((metric) => <Metric key={metric.label} {...metric} />)}
            </div>
            {row.margin && !row.margin.available && (
              <div className="onframe-promotion-manager-margin-alert">
                <Alert appearance="soft" tone="info">
                  {row.margin.message}
                </Alert>
              </div>
            )}
          </>
        )}
      </div>
      <div>
        <Calculation row={row} items={calculation} />
        {row.canBulk && !row.readOnly && (
          <div className="onframe-promotion-manager-bulk">
            <Checkbox
              checked={row.bulkEnabled}
              onChange={actions.onToggleBulk}
              disabled={row.busy}
              label="Aplicar a todas as variações"
              description="Esta aplicação será enviada para as variações ativas desta família."
            />
          </div>
        )}
      </div>
    </>
  );
}

function EditPanel({ row, actions }) {
  const confirm = () => {
    if (!row.validationError && !row.busy) actions.onConfirm(row.key, row.formAction);
  };

  return (
    <>
      <ContextFeedback feedback={row.feedback} className="onframe-promotion-manager-editor-feedback" />
      <div className={`onframe-promotion-manager-editor${row.readOnly ? ' is-readonly' : ''}`}>
        {row.type === 'coupon' ? (
          <>
            <div>
              <div className="onframe-promotion-manager-editor-metrics">
                <Metric label="Desconto" value={row.condition.primary} />
                <Metric label="Compra mínima" value={row.result.primary} />
                <Metric label="Reembolso máx." value={row.result.secondary} />
              </div>
            </div>
            <div />
          </>
        ) : (
          <PromotionFinancialDetails row={row} actions={actions} confirm={confirm} />
        )}
      </div>
      <div className="onframe-promotion-manager-editor-footer">
        {!row.readOnly && (
          <div className="onframe-promotion-manager-shortcuts" aria-label="Atalhos de teclado">
            <span>
              <Kbd size="sm">Esc</Kbd> cancela
            </span>
            <span>
              <Kbd size="sm">Enter</Kbd> confirma
            </span>
          </div>
        )}
        <div>
          <Button kind="neutral" size="sm" onClick={actions.onCancelEdit} disabled={row.busy}>
            {row.readOnly ? 'Fechar' : 'Cancelar'}
          </Button>
          {!row.readOnly && (
            <Button
              kind="primary"
              size="sm"
              icon={icon('check-circle')}
              disabled={Boolean(row.validationError) || row.busy}
              onClick={confirm}
            >
              {row.confirmLabel}
            </Button>
          )}
        </div>
      </div>
    </>
  );
}

function CardActions({ row, actions }) {
  if (row.formOpen) return null;
  if (row.group === 'available') {
    const isCoupon = row.type === 'coupon';
    return (
      <Button
        kind="quiet"
        tone={isCoupon ? 'warning' : 'primary'}
        size="sm"
        icon={icon(isCoupon ? 'clipboard-text' : 'tag')}
        onClick={() => actions.onOpen(row.key, row.createAction ? 'create' : 'details')}
        disabled={row.busy}
      >
        {isCoupon ? 'Revisar' : 'Configurar'}
      </Button>
    );
  }
  const items = [
    ...(row.canUpdate
      ? [
          {
            label: 'Editar',
            icon: 'pencil-simple',
            disabled: row.busy,
            onSelect: () => actions.onOpen(row.key, 'update')
          }
        ]
      : []),
    {
      label: 'Ver detalhes',
      icon: 'eye',
      disabled: row.busy,
      onSelect: () => actions.onOpen(row.key, 'details')
    },
    ...(row.canDelete
      ? [
          { type: 'separator' },
          {
            label: 'Remover',
            icon: 'trash',
            tone: 'danger',
            disabled: row.busy,
            onSelect: () => actions.onRemove(row.key)
          }
        ]
      : [])
  ];
  return (
    <Menu
      size="sm"
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
  );
}

function PromotionCard({ row, actions }) {
  return (
    <Card
      padding={0}
      style={{
        overflow: row.formOpen ? 'hidden' : 'visible',
        borderColor: row.formOpen ? 'var(--ob-blue)' : 'var(--ob-line-soft)'
      }}
    >
      <div className="onframe-promotion-manager-card">
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
        <div className="onframe-promotion-manager-condition">
          <span>{row.type === 'coupon' ? 'Desconto' : row.type === 'payment' ? 'Condição' : 'Preço'}</span>
          <strong>{row.condition.primary || '—'}</strong>
          {row.condition.secondary && <small>{row.condition.secondary}</small>}
        </div>
        <Result row={row} />
        <MarginSummary row={row} />
        <div className="onframe-promotion-manager-actions">
          <CardActions row={row} actions={actions} />
        </div>
      </div>
      {!row.formOpen && <ContextFeedback feedback={row.feedback} className="onframe-promotion-manager-card-feedback" />}
      {row.formOpen && <EditPanel row={row} actions={actions} />}
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
                      icon={icon('funnel', 18)}
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

          <ContextFeedback feedback={model.feedback} className="onframe-promotion-manager-alert" />

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
