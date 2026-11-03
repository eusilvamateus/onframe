import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Divider,
  EmptyState,
  Input,
  Modal,
  NumberField,
  Pagination,
  Ph,
  SearchInput,
  Select,
  Table,
  Textarea,
  Tooltip,
  toast
} from '@onblide/ui';
import { accountName } from '../shared/IntegrationAccount';
import { sendRemoteMessage, userError } from '../shared/runtime';
import { ProductSpreadsheetModal } from './ProductSpreadsheetModal';
import { downloadProductExport } from './product-spreadsheet';

const PAGE_SIZE = 25;
const EMPTY_FORM = {
  sku: '', name: '', description: '', cost: 0, taxRate: 0, variableCost: 0, status: 'active'
};

function money(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));
}

function statusLabel(status) {
  return status === 'inactive' ? 'Inativo' : 'Ativo';
}

function ProductForm({ product, accounts, admin, busy, onClose, onSaved }) {
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
  const [link, setLink] = useState({ accountLabel: '', itemId: '', variationId: '', sellerSku: '' });
  const [actionBusy, setActionBusy] = useState(false);
  const locked = busy || actionBusy;

  const accountOptions = useMemo(() => accounts.map((account) => ({
    label: `${accountName(account)} · ${account.user_id || account.meliUserId || account.meli_user_id || account.id}`,
    id: account.id
  })), [accounts]);

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

  async function addLink() {
    const account = accountOptions.find((option) => option.label === link.accountLabel);
    if (!account || !link.itemId.trim()) {
      setError('Selecione uma conta e informe o ID do anúncio.');
      return;
    }
    setError('');
    setActionBusy(true);
    try {
      const result = await sendRemoteMessage('product-link-create', {
        productId: current.id,
        payload: {
          sellerAccountId: account.id,
          itemId: link.itemId,
          variationId: link.variationId,
          sellerSku: link.sellerSku
        }
      });
      setCurrent(result);
      setLink({ accountLabel: '', itemId: '', variationId: '', sellerSku: '' });
      onSaved(result, 'Anúncio vinculado.');
    } catch (failure) {
      setError(userError(failure));
    } finally {
      setActionBusy(false);
    }
  }

  async function removeLink(linkId) {
    setError('');
    setActionBusy(true);
    try {
      const result = await sendRemoteMessage('product-link-delete', { productId: current.id, linkId });
      setCurrent(result);
      onSaved(result, 'Vínculo removido.');
    } catch (failure) {
      setError(userError(failure));
    } finally {
      setActionBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={locked ? undefined : onClose}
      title={current ? (admin ? 'Editar produto' : 'Detalhes do produto') : 'Novo produto'}
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

        {current && <>
          <Divider decorative />
          <section className="onframe-stack" aria-label="Anúncios vinculados">
            <div>
              <h3 className="onframe-product-section-title">Anúncios vinculados</h3>
              <p className="onframe-product-section-copy">Associe este produto aos anúncios e variações correspondentes.</p>
            </div>
            {current.links?.length > 0 ? <div className="onframe-product-links">
              {current.links.map((item) => <div className="onframe-product-link" key={item.id}>
                <div className="onframe-grow">
                  <p className="onframe-list-title">{item.itemId}{item.variationId ? ` · Variação ${item.variationId}` : ''}</p>
                  <p className="onframe-list-meta">{item.accountName}{item.sellerSku ? ` · SKU no anúncio: ${item.sellerSku}` : ''}</p>
                </div>
                {admin && <Tooltip label="Remover vínculo">
                  <Button kind="quiet" tone="danger" size="sm" aria-label="Remover vínculo" disabled={locked} icon={<Ph n="trash" size={16} />} onClick={() => void removeLink(item.id)} />
                </Tooltip>}
              </div>)}
            </div> : <p className="onframe-empty">Nenhum anúncio vinculado.</p>}
            {admin && <div className="onframe-product-link-form">
              <Select label="Conta" placeholder="Selecione" options={accountOptions} value={link.accountLabel || null} disabled={locked || accountOptions.length === 0} onChange={(value) => setLink((state) => ({ ...state, accountLabel: value }))} />
              <Input label="ID do anúncio" placeholder="MLB1234567890" value={link.itemId} disabled={locked} onChange={(event) => setLink((state) => ({ ...state, itemId: event.target.value }))} />
              <Input label="ID da variação" placeholder="Opcional" value={link.variationId} disabled={locked} onChange={(event) => setLink((state) => ({ ...state, variationId: event.target.value }))} />
              <Input label="SKU no anúncio" placeholder="Opcional" value={link.sellerSku} disabled={locked} onChange={(event) => setLink((state) => ({ ...state, sellerSku: event.target.value }))} />
              <Button kind="secondary" disabled={locked || accountOptions.length === 0} icon={<Ph n="link" size={16} />} onClick={() => void addLink()}>Vincular</Button>
            </div>}
          </section>
        </>}
      </div>
    </Modal>
  );
}

export function Products({ accounts, admin }) {
  const [products, setProducts] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, total: 0, totalPages: 1 });
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [status, setStatus] = useState('all');
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
      const result = await sendRemoteMessage('products', { query: { q: debouncedQuery, status, page, limit: PAGE_SIZE } });
      if (sequence !== requestSequence.current) return;
      setProducts(result.products || []);
      setPagination(result.pagination || { page, total: 0, totalPages: 1 });
    } catch (failure) {
      if (sequence !== requestSequence.current) return;
      setError(userError(failure, 'Não foi possível carregar os produtos.'));
    } finally {
      if (sequence === requestSequence.current) setLoading(false);
    }
  }, [debouncedQuery, status]);

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

  async function exportCatalog() {
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
  }

  function imported({ summary }) {
    toast({
      tone: summary.rejected > 0 ? 'warning' : 'success',
      title: 'Importação processada.',
      body: `${summary.created} criados, ${summary.updated} atualizados e ${summary.rejected} rejeitados.`
    });
    void load(1);
  }

  const columns = [
    { key: 'sku', label: 'SKU', bold: true, width: 150 },
    { key: 'name', label: 'Produto', bold: true, render: (_, product) => <div><p className="onframe-list-title">{product.name}</p><p className="onframe-list-meta">{product.links?.length || 0} {(product.links?.length || 0) === 1 ? 'vínculo' : 'vínculos'}</p></div> },
    { key: 'cost', label: 'Custo', width: 135, render: (value) => money(value) },
    { key: 'taxRate', label: 'Imposto', width: 105, render: (value) => `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(value)}%` },
    { key: 'variableCost', label: 'Outros custos', width: 145, render: (value) => money(value) },
    { key: 'status', label: 'Status', width: 105, render: (value) => <Badge tone={value === 'active' ? 'green' : 'grey'}>{statusLabel(value)}</Badge> },
    { key: 'actions', label: '', width: admin ? 180 : 90, render: (_, product) => <div className="onframe-actions">
      <Button kind="secondary" size="sm" disabled={loading} onClick={() => setDialog({ type: 'product', product })}>{admin ? 'Editar' : 'Ver'}</Button>
      {admin && <Tooltip label="Arquivar produto"><Button kind="quiet" tone="danger" size="sm" aria-label="Arquivar produto" disabled={loading} icon={<Ph n="archive" size={16} />} onClick={() => setDialog({ type: 'archive', product })} /></Tooltip>}
    </div> }
  ];

  return <div className="onframe-products onframe-stack">
    {error && <Alert tone="danger" dismissible onClose={() => setError('')}>{error}</Alert>}
    <div className="onframe-products-toolbar">
      <SearchInput value={query} onChange={setQuery} loading={loading && query !== debouncedQuery} placeholder="Buscar por SKU, nome ou descrição" ariaLabel="Buscar produtos" width="100%" />
      <Select
        ariaLabel="Filtrar por status"
        options={['Todos', 'Ativos', 'Inativos']}
        value={status === 'active' ? 'Ativos' : status === 'inactive' ? 'Inativos' : 'Todos'}
        onChange={(value) => setStatus(value === 'Ativos' ? 'active' : value === 'Inativos' ? 'inactive' : 'all')}
        width={180}
      />
      <div className="onframe-products-toolbar-actions">
        <Button kind="secondary" disabled={transferBusy} icon={<Ph n="download-simple" size={17} />} onClick={() => void exportCatalog()}>Exportar</Button>
        {admin && <Button kind="secondary" disabled={transferBusy} icon={<Ph n="upload-simple" size={17} />} onClick={() => setDialog({ type: 'import' })}>Importar</Button>}
        {admin && <Button disabled={transferBusy} icon={<Ph n="plus" size={17} />} onClick={() => setDialog({ type: 'product', product: null })}>Novo produto</Button>}
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
    {dialog?.type === 'product' && <ProductForm key={dialog.product?.id || 'new'} product={dialog.product} accounts={accounts} admin={admin} busy={loading} onClose={() => setDialog(null)} onSaved={reflectProduct} />}
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
