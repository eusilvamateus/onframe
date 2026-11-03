import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Button,
  ButtonGroup,
  Chip,
  Drawer,
  EmptyState,
  Input,
  MenuPanel,
  Modal,
  NumberField,
  Pagination,
  Ph,
  Popover,
  SearchInput,
  Spinner,
  Switch,
  Table,
  Tooltip,
  ToggleButton,
  toast
} from '@onblide/ui';
import { sendRemoteMessage, userError } from '../shared/runtime';
import { ProductSpreadsheetModal } from './ProductSpreadsheetModal';
import { downloadProductExport } from './product-spreadsheet';

const PAGE_SIZE = 25;
const STATUS_FILTERS = [
  { value: 'all', label: 'Todos' },
  { value: 'active', label: 'Ativos' },
  { value: 'inactive', label: 'Inativos' }
];
const SORT_FILTERS = [
  { value: 'sku', label: 'Código SKU' },
  { value: 'name', label: 'Nome' },
  { value: 'recent', label: 'Mais recentes' },
  { value: 'updated', label: 'Data de atualização' }
];
const EMPTY_FORM = {
  sku: '', name: '', cost: 0, taxRate: 0, customCosts: [], status: 'active'
};

function customCostKey() {
  return globalThis.crypto?.randomUUID?.() || `cost-${Date.now()}-${Math.random()}`;
}

function money(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));
}

function customCostSummary(cost) {
  const value = cost.type === 'percentage'
    ? `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(Number(cost.value || 0))}%`
    : money(cost.value);
  return { description: cost.description.trim() || 'Novo custo', value };
}

function ProductChipFilter({ ariaLabel, icon, options, value, selected, width, onChange }) {
  const current = options.find((option) => option.value === value) || options[0];
  return <Popover
    ariaLabel={ariaLabel}
    placement="bottom"
    align="start"
    width={width}
    padding={12}
    closeButton={false}
    trigger={<Chip icon={icon} label={current.label} size="md" selected={selected} />}
  >
    {(close) => <div className="onframe-products-filter-options" role="group" aria-label={ariaLabel}>
      {options.map((option) => <Chip
        key={option.value}
        label={option.label}
        size="sm"
        selected={value === option.value}
        onToggle={() => {
          onChange(option.value);
          close();
        }}
      />)}
    </div>}
  </Popover>;
}

function ProductSku({ sku }) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(sku);
      toast({ tone: 'success', title: 'SKU copiado.' });
    } catch {
      toast({ tone: 'danger', title: 'Não foi possível copiar o SKU.' });
    }
  };

  return <Tooltip label="Copiar SKU" placement="top">
    <Button
      kind="quiet"
      tone="primary"
      fill={false}
      size="sm"
      aria-label={`Copiar SKU ${sku}`}
      onClick={() => void copy()}
      style={{ minHeight: 24, maxWidth: '100%', justifyContent: 'flex-start', gap: 4, padding: 0, fontFamily: 'var(--ob-font-mono)', fontSize: 'var(--ob-fs-xs)' }}
    >
      <span className="onframe-product-sku-value">{sku}</span>
      <Ph n="copy" size={13} />
    </Button>
  </Tooltip>;
}

function ProductForm({ product, admin, busy, onClose, onSaved }) {
  const [values, setValues] = useState(() => product ? {
    sku: product.sku,
    name: product.name,
    cost: product.cost,
    taxRate: product.taxRate,
    customCosts: (product.customCosts || []).map((cost) => ({ ...cost, key: customCostKey() })),
    status: product.status
  } : EMPTY_FORM);
  const [current, setCurrent] = useState(product);
  const [error, setError] = useState('');
  const [actionBusy, setActionBusy] = useState(false);
  const [selectedCustomCostKey, setSelectedCustomCostKey] = useState(null);
  const locked = busy || actionBusy;

  const setField = (field, value) => setValues((state) => ({ ...state, [field]: value }));
  const addCustomCost = () => {
    const key = customCostKey();
    setValues((state) => ({
      ...state,
      customCosts: [...state.customCosts, { key, description: '', type: 'fixed', value: 0 }]
    }));
    setSelectedCustomCostKey(key);
  };
  const updateCustomCost = (key, field, value) => setValues((state) => ({
    ...state,
    customCosts: state.customCosts.map((cost) => cost.key === key ? { ...cost, [field]: value } : cost)
  }));
  const removeCustomCost = (key) => {
    setValues((state) => ({
      ...state,
      customCosts: state.customCosts.filter((cost) => cost.key !== key)
    }));
    setSelectedCustomCostKey((selected) => selected === key ? null : selected);
  };
  const selectedCustomCost = values.customCosts.find((cost) => cost.key === selectedCustomCostKey) || null;

  async function save() {
    if (!values.sku.trim() || !values.name.trim()) {
      setError('Informe o SKU e o nome do produto.');
      return;
    }
    if (values.customCosts.some((cost) => !cost.description.trim())) {
      setError('Informe a descrição de todos os custos personalizados.');
      return;
    }
    setError('');
    setActionBusy(true);
    let closeAfterSave = false;
    try {
      const payload = {
        ...values,
        sku: values.sku.trim(),
        name: values.name.trim(),
        customCosts: values.customCosts.map(({ description, type, value }) => ({ description: description.trim(), type, value }))
      };
      const result = await sendRemoteMessage(current ? 'product-update' : 'product-create', {
        productId: current?.id,
        payload
      });
      setCurrent(result);
      onSaved(result, current ? 'Produto atualizado.' : 'Produto criado.');
      closeAfterSave = !current;
    } catch (failure) {
      setError(userError(failure));
    } finally {
      setActionBusy(false);
    }
    if (closeAfterSave) onClose();
  }

  return (
    <Drawer
      open
      onClose={locked ? () => {} : onClose}
      title={current ? (admin ? 'Editar produto' : 'Detalhes do produto') : 'Criar produto'}
      side="right"
      width={520}
      footer={<>
        <Button kind="secondary" disabled={locked} onClick={onClose}>{admin ? 'Cancelar' : 'Fechar'}</Button>
        {admin && <Button disabled={locked} onClick={() => void save()} icon={<Ph n="floppy-disk" size={17} />}>{current ? 'Salvar alterações' : 'Criar produto'}</Button>}
      </>}
    >
      <div className="onframe-product-drawer">
        {error && <div className="onframe-product-form-error">
          <Alert tone="danger" dismissible onClose={() => setError('')}>{error}</Alert>
        </div>}
        <section className="onframe-product-form-section">
          <h3>Identificação</h3>
          <div className="onframe-product-form-fields">
            <Input label="Nome" value={values.name} maxLength={160} disabled={!admin || locked} onChange={(event) => setField('name', event.target.value)} />
            <Input label="SKU" value={values.sku} maxLength={80} disabled={!admin || locked} onChange={(event) => setField('sku', event.target.value)} />
          </div>
        </section>

        <section className="onframe-product-form-section">
          <h3>Custos</h3>
          <div className="onframe-product-cost-grid">
            <NumberField label="Custo do produto" value={values.cost} min={0} decimals={2} step={0.01} controls="none" startAddon="R$" disabled={!admin || locked} onChange={(value) => setField('cost', value ?? 0)} />
            <NumberField label="Alíquota de imposto" value={values.taxRate} min={0} max={100} decimals={2} step={0.01} controls="none" endAddon="%" disabled={!admin || locked} onChange={(value) => setField('taxRate', value ?? 0)} />
          </div>
          <div className="onframe-product-custom-costs">
            <div className="onframe-product-custom-costs-header">
              <strong>Custos personalizados</strong>
              {admin && <Button kind="quiet" tone="primary" size="sm" disabled={locked} icon={<Ph n="plus-circle" size={15} />} onClick={addCustomCost}>Adicionar custo</Button>}
            </div>
            {values.customCosts.length === 0 && <p className="onframe-product-custom-costs-empty">Nenhum custo personalizado.</p>}
            {values.customCosts.length > 0 && <div className="onframe-product-custom-cost-chips" aria-label="Custos personalizados">
              {values.customCosts.map((cost) => {
                const summary = customCostSummary(cost);
                return <Chip
                  key={cost.key}
                  label={<span className="onframe-product-custom-cost-chip-label">
                    <span className="onframe-product-custom-cost-chip-name">{summary.description}</span>
                    <span className="onframe-product-custom-cost-chip-value">{summary.value}</span>
                  </span>}
                  aria-label={`Editar custo ${summary.description}: ${summary.value}`}
                  title={`${summary.description}: ${summary.value}`}
                  size="md"
                  selected={selectedCustomCostKey === cost.key}
                  onToggle={() => setSelectedCustomCostKey((selected) => selected === cost.key ? null : cost.key)}
                  removable={admin}
                  onRemove={admin ? () => removeCustomCost(cost.key) : undefined}
                  disabled={locked}
                />;
              })}
            </div>}
            {selectedCustomCost && <div className="onframe-product-custom-cost-editor">
              <Input
                label="Descrição do custo"
                value={selectedCustomCost.description}
                maxLength={120}
                disabled={!admin || locked}
                onChange={(event) => updateCustomCost(selectedCustomCost.key, 'description', event.target.value)}
              />
              <div className="onframe-product-custom-cost-value">
                <ButtonGroup selection="single" value={selectedCustomCost.type} onChange={(value) => updateCustomCost(selectedCustomCost.key, 'type', value)} ariaLabel="Tipo do custo" disabled={!admin || locked}>
                  <ToggleButton value="fixed" appearance="ghost" tone="primary">R$</ToggleButton>
                  <ToggleButton value="percentage" appearance="ghost" tone="primary">%</ToggleButton>
                </ButtonGroup>
                <NumberField
                  label="Valor"
                  value={selectedCustomCost.value}
                  min={0}
                  max={selectedCustomCost.type === 'percentage' ? 100 : undefined}
                  decimals={2}
                  step={0.01}
                  controls="none"
                  startAddon={selectedCustomCost.type === 'fixed' ? 'R$' : undefined}
                  endAddon={selectedCustomCost.type === 'percentage' ? '%' : undefined}
                  disabled={!admin || locked}
                  onChange={(value) => updateCustomCost(selectedCustomCost.key, 'value', value ?? 0)}
                />
              </div>
            </div>}
          </div>
        </section>

        <section className="onframe-product-form-section">
          <h3>Situação</h3>
          <div className="onframe-product-status-row">
            <strong>Produto ativo</strong>
            <Switch
              checked={values.status === 'active'}
              label={values.status === 'active' ? 'Ativo' : 'Inativo'}
              disabled={!admin || locked}
              onChange={(checked) => setField('status', checked ? 'active' : 'inactive')}
            />
          </div>
        </section>
      </div>
    </Drawer>
  );
}

export function Products({ admin, onHeaderActionsChange }) {
  const [products, setProducts] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, total: 0, totalPages: 1 });
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [sort, setSort] = useState('updated');
  const [loading, setLoading] = useState(true);
  const [exportBusy, setExportBusy] = useState(false);
  const [dialog, setDialog] = useState(null);
  const [error, setError] = useState('');
  const requestSequence = useRef(0);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedQuery(query.trim()), 250);
    return () => window.clearTimeout(timeout);
  }, [query]);

  const load = useCallback(async (page = 1) => {
    const sequence = ++requestSequence.current;
    setLoading(true);
    setError('');
    try {
      const result = await sendRemoteMessage('products', { query: { q: debouncedQuery, status, sort, page, limit: PAGE_SIZE } });
      if (sequence !== requestSequence.current) return;
      setProducts(result.products || []);
      setPagination(result.pagination || { page, total: 0, totalPages: 1 });
    } catch (failure) {
      if (sequence !== requestSequence.current) return;
      setError(userError(failure, 'Não foi possível carregar os produtos.'));
    } finally {
      if (sequence === requestSequence.current) setLoading(false);
    }
  }, [debouncedQuery, sort, status]);

  useEffect(() => { void load(1); }, [load]);

  function reflectProduct(product, message) {
    setProducts((items) => items.map((item) => item.id === product.id ? product : item));
    toast({ tone: 'success', title: message });
    void load(pagination.page);
  }

  async function archive(product) {
    setLoading(true);
    setError('');
    try {
      await sendRemoteMessage('product-archive', { productId: product.id });
      setDialog(null);
      toast({ tone: 'success', title: 'Produto arquivado.' });
      await load(Math.min(pagination.page, Math.max(1, pagination.totalPages)));
    } catch (failure) {
      setError(userError(failure));
    } finally {
      setLoading(false);
    }
  }

  const exportCatalog = useCallback(async () => {
    setExportBusy(true);
    setError('');
    try {
      const catalog = [];
      let page = 1;
      let totalPages = 1;
      do {
        const result = await sendRemoteMessage('products', { query: { status: 'all', page, limit: 100 } });
        catalog.push(...(result.products || []));
        totalPages = result.pagination?.totalPages || 1;
        page += 1;
      } while (page <= totalPages);
      downloadProductExport(catalog);
      toast({ tone: 'success', title: 'Planilha gerada.', body: `${catalog.length} ${catalog.length === 1 ? 'produto incluído' : 'produtos incluídos'}.` });
    } catch (failure) {
      setError(userError(failure, 'Não foi possível gerar a planilha de produtos.'));
    } finally {
      setExportBusy(false);
    }
  }, []);

  useEffect(() => {
    if (!onHeaderActionsChange) return undefined;
    onHeaderActionsChange(
      <div className="onframe-products-header-actions">
        <Button
          kind="secondary"
          disabled={exportBusy}
          aria-busy={exportBusy}
          icon={exportBusy ? <Spinner size="xs" label="Gerando planilha" /> : <Ph n="download-simple" size={17} />}
          onClick={() => void exportCatalog()}
        >{exportBusy ? 'Gerando planilha...' : 'Baixar planilha'}</Button>
        {admin && <Button kind="secondary" icon={<Ph n="upload-simple" size={17} />} onClick={() => setDialog({ type: 'import' })}>Importar</Button>}
        {admin && <Button icon={<Ph n="plus-circle" size={17} />} onClick={() => setDialog({ type: 'product', product: null })}>Criar produto</Button>}
      </div>
    );
    return undefined;
  }, [admin, exportBusy, exportCatalog, onHeaderActionsChange]);

  function imported({ summary }) {
    toast({
      tone: summary.rejected > 0 ? 'warning' : 'success',
      title: 'Importação processada.',
      body: `${summary.created} criados, ${summary.updated} atualizados e ${summary.rejected} rejeitados.`
    });
    void load(1);
  }

  const columns = [
    { key: 'name', label: 'Produto', bold: true, render: (value) => <p className="onframe-list-title">{value}</p> },
    { key: 'sku', label: 'SKU', width: 220, render: (value) => <ProductSku sku={String(value || '')} /> },
    { key: 'cost', label: 'Custo', width: 135, render: (value) => money(value) },
    { key: 'taxRate', label: 'Imposto', width: 105, render: (value) => `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(value)}%` },
    { key: 'actions', label: '', width: 56, render: (_, product) => <div className="onframe-product-action-menu">
      <Popover
        placement="bottom"
        align="end"
        width={196}
        padding={0}
        closeButton={false}
        ariaLabel={`Ações de ${product.name}`}
        trigger={<Button kind="quiet" size="sm" iconOnly aria-label={`Abrir ações de ${product.name}`} disabled={loading} icon={<Ph n="dots-three-vertical" size={18} />} />}
      >
        {(close) => <MenuPanel
          size="sm"
          ariaLabel={`Ações de ${product.name}`}
          onCloseTree={close}
          items={[
            { label: admin ? 'Editar produto' : 'Ver detalhes', icon: admin ? 'pencil-simple' : 'eye', disabled: loading, onSelect: () => setDialog({ type: 'product', product }) },
            ...(admin ? [
              { type: 'separator' },
              { label: 'Arquivar produto', icon: 'archive', tone: 'danger', disabled: loading, onSelect: () => setDialog({ type: 'archive', product }) }
            ] : [])
          ]}
          style={{ minWidth: 196, border: 'none', boxShadow: 'none' }}
        />}
      </Popover>
    </div> }
  ];

  return <div className="onframe-products onframe-stack">
    {error && <Alert tone="danger" dismissible onClose={() => setError('')}>{error}</Alert>}
    <div className="onframe-products-toolbar">
      <div className="onframe-products-search">
        <SearchInput value={query} onChange={setQuery} loading={loading && query !== debouncedQuery} placeholder="Buscar por SKU ou nome" ariaLabel="Buscar produtos" width="100%" />
      </div>
      <div className="onframe-products-filters">
        <ProductChipFilter
          ariaLabel="Filtrar produtos por status"
          icon="funnel-simple"
          options={STATUS_FILTERS}
          value={status}
          selected={status !== 'all'}
          width={240}
          onChange={setStatus}
        />
        <ProductChipFilter
          ariaLabel="Ordenar produtos"
          icon="sort-ascending"
          options={SORT_FILTERS}
          value={sort}
          selected
          width={300}
          onChange={setSort}
        />
      </div>
    </div>
    <div className="onframe-products-table">
      <Table
        columns={columns}
        rows={products}
        loading={loading}
        emptyState={<EmptyState icon="package" size="sm" title={debouncedQuery ? 'Nenhum produto encontrado' : 'Nenhum produto cadastrado'} description={debouncedQuery ? 'Revise a busca ou os filtros aplicados.' : 'Cadastre o primeiro produto para organizar custos e anúncios.'} />}
      />
    </div>
    {pagination.totalPages > 1 && <div className="onframe-products-pagination">
      <span>{pagination.total} produtos</span>
      <Pagination page={pagination.page} total={pagination.totalPages} onChange={(page) => void load(page)} />
    </div>}
    {dialog?.type === 'product' && <ProductForm key={dialog.product?.id || 'new'} product={dialog.product} admin={admin} busy={loading} onClose={() => setDialog(null)} onSaved={reflectProduct} />}
    {dialog?.type === 'import' && <ProductSpreadsheetModal onClose={() => setDialog(null)} onImported={imported} />}
    <Modal
      open={dialog?.type === 'archive'}
      onClose={loading ? undefined : () => setDialog(null)}
      title="Arquivar produto"
      role="alertdialog"
      size="sm"
      footer={<><Button kind="secondary" disabled={loading} onClick={() => setDialog(null)}>Cancelar</Button><Button kind="danger" disabled={loading} onClick={() => void archive(dialog.product)}>Arquivar</Button></>}
    >
      O produto <strong>{dialog?.product?.name}</strong> deixará de aparecer no catálogo. Seu histórico de custos será preservado.
    </Modal>
  </div>;
}
