import { Component } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  EmptyState,
  Input,
  Kbd,
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
  const tone = status.id === 'active'
    ? 'green'
    : status.id === 'programmed'
      ? 'blue'
      : status.id === 'available'
        ? 'orange'
        : 'grey';
  return <Badge tone={tone} variant="subtle" size="sm" dot>{status.label}</Badge>;
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
      {row.result.loading
        ? <Skeleton width={110} height={20} radius={6} style={{ marginTop: 4 }} />
        : <strong className="success">{row.result.primary || '—'}</strong>}
      {row.result.secondary && <small>{row.result.secondary}</small>}
    </div>
  );
}

function Calculation({ row }) {
  if (!row.calculation?.length) return null;
  return (
    <div>
      <div className="onframe-promotion-manager-kicker">Como o valor é calculado</div>
      <div className="onframe-promotion-manager-calculation">
        {row.calculation.map((item, index) => (
          <div key={`${item.label}-${index}`} className={item.tone || ''}>
            <span>{item.label}{item.description && <small>{item.description}</small>}</span>
            <strong>{item.value}</strong>
          </div>
        ))}
      </div>
      <p className="onframe-promotion-manager-note">Estimativa calculada com o preço promocional.</p>
    </div>
  );
}

function EditPanel({ row, actions }) {
  const confirm = () => {
    if (!row.validationError && !row.busy) actions.onConfirm(row.key, row.formAction);
  };

  return (
    <>
      <div className={`onframe-promotion-manager-editor${row.readOnly ? ' is-readonly' : ''}`}>
        {row.type === 'coupon' ? (
          <div>
            <div className="onframe-promotion-manager-editor-metrics">
              <Metric label="Desconto" value={row.condition.primary} />
              <Metric label="Compra mínima" value={row.result.primary} />
              <Metric label="Reembolso máx." value={row.result.secondary} />
            </div>
          </div>
        ) : (
          <div>
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
            <div className="onframe-promotion-manager-editor-metrics">
              {row.result.loading
                ? [0, 1, 2].map((item) => <Skeleton key={item} width="72%" height={38} radius={6} />)
                : row.metrics.map((metric) => <Metric key={metric.label} {...metric} />)}
            </div>
            {row.margin && !row.margin.available && <div className="onframe-promotion-manager-margin-alert"><Alert tone="info">{row.margin.message}</Alert></div>}
          </div>
        )}
        <div>
          {row.type !== 'coupon' && <Calculation row={row} />}
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
      </div>
      <div className="onframe-promotion-manager-editor-footer">
        {!row.readOnly && (
          <div className="onframe-promotion-manager-shortcuts" aria-label="Atalhos de teclado">
            <span><Kbd size="sm">Esc</Kbd> cancela</span>
            <span><Kbd size="sm">Enter</Kbd> confirma</span>
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
  return (
    <>
      <Button
        kind="quiet"
        tone={row.canUpdate ? 'primary' : 'neutral'}
        size="sm"
        icon={icon(row.canUpdate ? 'pencil-simple' : 'eye')}
        onClick={() => actions.onOpen(row.key, row.canUpdate ? 'update' : 'details')}
        disabled={row.busy}
      >
        {row.canUpdate ? 'Editar' : 'Detalhes'}
      </Button>
      {row.canDelete && (
        <Tooltip label="Remover promoção" placement="top">
          <Button
            kind="quiet"
            tone="danger"
            size="sm"
            iconOnly
            aria-label="Remover promoção"
            icon={icon('trash')}
            onClick={() => actions.onRemove(row.key)}
            disabled={row.busy}
          />
        </Tooltip>
      )}
    </>
  );
}

function PromotionCard({ row, actions }) {
  if (row.removed) {
    return (
      <Alert tone="success" action="Desfazer" onAction={() => actions.onUndoRemove(row.key)}>
        {row.name} removida.
      </Alert>
    );
  }

  return (
    <Card padding={0} style={{ overflow: 'hidden', borderColor: row.formOpen ? 'var(--ob-blue)' : 'var(--ob-line-soft)' }}>
      <div className="onframe-promotion-manager-card">
        <div className="onframe-promotion-manager-name">
          <span className={`onframe-commerce-promotion-type-icon ${row.type}`} aria-hidden="true">
            <Ph n={row.type === 'coupon' ? 'ticket' : row.type === 'payment' ? 'credit-card' : 'tag'} size={20} />
          </span>
          <div>
            <strong>{row.name}<StatusBadge status={row.status} /></strong>
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
        <div className="onframe-promotion-manager-actions"><CardActions row={row} actions={actions} /></div>
      </div>
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
      <h2>{definition.title}<Badge tone="grey" variant="numeric" size="sm">{rows.length}</Badge></h2>
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
            {rows.filter((row) => row.type === type.id).map((row) => <PromotionCard key={row.key} row={row} actions={actions} />)}
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

  return (
    <Modal
      open
      onClose={model.openKey ? actions.onCancelEdit : actions.onClose}
      title={<HeaderTitle />}
      width={1080}
      maxHeight="min(88vh, 900px)"
      footer={<Button kind="neutral" onClick={actions.onClose}>Fechar</Button>}
    >
      <div className="onframe-promotion-manager">
        <div className="onframe-promotion-manager-toolbar">
          <div className="onframe-promotion-manager-toolbar-line">
            <div className="onframe-promotion-manager-toolbar-actions">
              <Tooltip label={model.loading ? 'Atualizando…' : 'Atualizado agora · clique para atualizar'} placement="bottom">
                <Button
                  kind="neutral"
                  iconOnly
                  aria-label="Atualizar promoções"
                  icon={icon(model.loading ? 'circle-notch' : 'arrow-clockwise', 18)}
                  onClick={actions.onReload}
                  disabled={model.loading}
                />
              </Tooltip>
              {model.canCreateDiscount && (
                <Button kind="primary" icon={icon('tag', 18)} onClick={actions.onCreateDiscount} disabled={model.busy}>
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
                trigger={(
                  <Button
                    kind="secondary"
                    icon={icon('sliders-horizontal', 18)}
                    count={filterCount || undefined}
                    countTone="blue"
                  >
                    Filtros
                  </Button>
                )}
                title="Filtrar promoções"
                width={280}
                align="start"
                footer={filterCount ? <Button kind="ghost" size="sm" onClick={actions.onClearAdvancedFilters}>Limpar filtros</Button> : undefined}
              >
                <div className="onframe-promotion-manager-filter-group">
                  <strong>Estado</strong>
                  <Checkbox checked={model.statusFilters.includes('active')} onChange={() => actions.onToggleStatus('active')} label="Ativas" />
                  <Checkbox checked={model.statusFilters.includes('programmed')} onChange={() => actions.onToggleStatus('programmed')} label="Programadas" />
                  <Checkbox checked={model.statusFilters.includes('available')} onChange={() => actions.onToggleStatus('available')} label="Elegíveis" />
                </div>
                <div className="onframe-promotion-manager-filter-group">
                  <strong>Tipo</strong>
                  <Checkbox checked={model.typeFilters.includes('direct')} onChange={() => actions.onToggleType('direct')} label="Descontos diretos" />
                  <Checkbox checked={model.typeFilters.includes('payment')} onChange={() => actions.onToggleType('payment')} label="Descontos por pagamento" />
                </div>
                <div className="onframe-promotion-manager-filter-group">
                  <strong>Financeiro</strong>
                  <Checkbox checked={model.financialFilters.includes('fee_reduction')} onChange={() => actions.onToggleFinancial('fee_reduction')} label="Com redução de tarifa" />
                </div>
              </Popover>
              <Tabs tabs={tabs} active={model.tab} onChange={actions.onTabChange} variant="pill" size="sm" />
            </div>
          </div>
        </div>

        {model.error && <div className="onframe-promotion-manager-alert"><Alert tone="danger">{model.error}</Alert></div>}

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
              action={<Button kind="secondary" size="sm" onClick={actions.onClearFilters}>Limpar filtros</Button>}
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
