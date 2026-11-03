import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Chip,
  EmptyState,
  Input,
  MenuPanel,
  Modal,
  NumberField,
  Pagination,
  Ph,
  Popover,
  SearchInput,
  Select,
  Table,
  Textarea,
  Tooltip,
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
  sku: '', name: '', description: '', cost: 0, taxRate: 0, variableCost: 0, status: 'active'
};

function money(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));
}

function statusLabel(status) {
  return status === 'inactive' ? 'Inativo' : 'Ativo';
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
    description: product.description || '',
    cost: product.cost,
    taxRate: product.taxRate,
    variableCost: product.variableCost,
    status: product.status
  } : EMPTY_FORM);
  const [current, setCurrent] = useState(product);
  const [error, setError] = useState('');
  const [actionBusy, setActionBusy] = useState(false);
  const locked = busy || actionBusy;

  const setField = (field, value) => setValues((state) => ({ ...state, [field]: value }));

  async function save() {
    if (!values.sku.trim() || !values.name.trim()) {
      setError('Informe o SKU e o nome do produto.');
      return;
    }
    setError('');
    setActionBusy(true);
    let closeAfterSave = false;
    try {
      const payload = { ...values, sku: values.sku.trim(), name: values.name.trim(), description: values.description.trim() };
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
    <Modal
      open
      onClose={locked ? undefined : onClose}
      title={current ? (admin ? 'Editar produto' : 'Detalhes do produto') : 'Criar produto'}
      size="lg"
      maxHeight="calc(100vh - 48px)"
      footer={<>
        <Button kind="secondary" disabled={locked} onClick={onClose}>{admin ? 'Cancelar' : 'Fechar'}</Button>
        {admin && <Button disabled={locked} onClick={() => void save()} icon={<Ph n="floppy-disk" size={17} />}>{current ? 'Salvar alterações' : 'Criar produto'}</Button>}
      </>}
    >
      <div className="onframe-product-modal onframe-stack">
        {error && <Alert tone="danger" dismissible onClose={() => setError('')}>{error}</Alert>}
        <div className="onframe-product-form-grid">
          <Input label="SKU" value={values.sku} maxLength={80} disabled={!admin || locked} onChange={(event) => setField('sku', event.target.value)} />
          <Input label="Nome" value={values.name} maxLength={160} disabled={!admin || locked} onChange={(event) => setField('name', event.target.value)} />
        </div>
        <Textarea label="Descrição" value={values.description} maxLength={4000} minRows={3} maxRows={6} autosize disabled={!admin || locked} onChange={(value) => setField('description', value)} />
        <div className="onframe-product-form-grid onframe-product-form-grid--three">
          <NumberField label="Custo do produto" value={values.cost} min={0} decimals={2} step={0.01} controls="none" startAddon="R$" disabled={!admin || locked} onChange={(value) => setField('cost', value ?? 0)} />
          <NumberField label="Alíquota de imposto" value={values.taxRate} min={0} max={100} decimals={2} step={0.01} controls="none" endAddon="%" disabled={!admin || locked} onChange={(value) => setField('taxRate', value ?? 0)} />
          <NumberField label="Outros custos variáveis" value={values.variableCost} min={0} decimals={2} step={0.01} controls="none" startAddon="R$" disabled={!admin || locked} onChange={(value) => setField('variableCost', value ?? 0)} />
        </div>
        <Select
          label="Status"
          options={['Ativo', 'Inativo']}
          value={statusLabel(values.status)}
          disabled={!admin || locked}
          onChange={(value) => setField('status', value === 'Inativo' ? 'inactive' : 'active')}
          width={220}
        />

      </div>
    </Modal>
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
  const [transferBusy, setTransferBusy] = useState(false);
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
    setTransferBusy(true);
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
      toast({ tone: 'success', title: `${catalog.length} ${catalog.length === 1 ? 'produto exportado' : 'produtos exportados'}.` });
    } catch (failure) {
      setError(userError(failure, 'Não foi possível exportar os produtos.'));
    } finally {
      setTransferBusy(false);
    }
  }, []);

  useEffect(() => {
    if (!onHeaderActionsChange) return undefined;
    onHeaderActionsChange(
      <div className="onframe-products-header-actions">
        <Button kind="secondary" disabled={transferBusy} icon={<Ph n="download-simple" size={17} />} onClick={() => void exportCatalog()}>Exportar</Button>
        {admin && <Button kind="secondary" disabled={transferBusy} icon={<Ph n="upload-simple" size={17} />} onClick={() => setDialog({ type: 'import' })}>Importar</Button>}
        {admin && <Button disabled={transferBusy} icon={<Ph n="plus" size={17} />} onClick={() => setDialog({ type: 'product', product: null })}>Criar produto</Button>}
      </div>
    );
    return undefined;
  }, [admin, exportCatalog, onHeaderActionsChange, transferBusy]);

  function imported({ summary }) {
    toast({
      tone: summary.rejected > 0 ? 'warning' : 'success',
      title: 'Importação processada.',
      body: `${summary.created} criados, ${summary.updated} atualizados e ${summary.rejected} rejeitados.`
    });
    void load(1);
  }

  const columns = [
    { key: 'sku', label: 'SKU', width: 220, render: (value) => <ProductSku sku={String(value || '')} /> },
    { key: 'name', label: 'Produto', bold: true, render: (_, product) => <div><p className="onframe-list-title">{product.name}</p>{product.description && <p className="onframe-list-meta">{product.description}</p>}</div> },
    { key: 'cost', label: 'Custo', width: 135, render: (value) => money(value) },
    { key: 'taxRate', label: 'Imposto', width: 105, render: (value) => `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(value)}%` },
    { key: 'variableCost', label: 'Outros custos', width: 145, render: (value) => money(value) },
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
        <SearchInput value={query} onChange={setQuery} loading={loading && query !== debouncedQuery} placeholder="Buscar por SKU, nome ou descrição" ariaLabel="Buscar produtos" width="100%" />
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
