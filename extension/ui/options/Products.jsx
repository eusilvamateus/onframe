import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  AlertDialog,
  Button,
  ButtonGroup,
  Card,
  Divider,
  Chip,
  Drawer,
  EmptyState,
  Input,
  List,
  ListItem,
  Menu,
  MenuPanel,
  Modal,
  NumberField,
  Pagination,
  Ph,
  Popover,
  ProgressBar,
  SearchInput,
  Select,
  Spinner,
  Switch,
  Table,
  Tooltip,
  ToggleButton,
  toast,
  useBreakpoint
} from '@onblide/ui';
import { sendRemoteMessage, userError } from '../shared/runtime';
import { ProductSpreadsheetModal } from './ProductSpreadsheetModal';
import { downloadProductExport } from './product-spreadsheet';

const PAGE_SIZE = 25;
const STATUS_FILTERS = [
  { value: 'all', label: 'Todos' },
  { value: 'active', label: 'Ativos' },
  { value: 'inactive', label: 'Inativos' },
  { value: 'deleted', label: 'Excluídos' }
];
const SORT_FILTERS = [
  { value: 'sku', label: 'Código SKU' },
  { value: 'name', label: 'Nome' },
  { value: 'recent', label: 'Mais recentes' },
  { value: 'updated', label: 'Data de atualização' }
];
const EMPTY_FORM = {
  sku: '',
  name: '',
  cost: 0,
  taxRate: null,
  minimumContributionMargin: null,
  accountTaxRates: [],
  customCosts: [],
  status: 'active'
};

function customCostKey() {
  return globalThis.crypto?.randomUUID?.() || `cost-${Date.now()}-${Math.random()}`;
}

function accountTaxRateKey() {
  return globalThis.crypto?.randomUUID?.() || `tax-${Date.now()}-${Math.random()}`;
}

function productAccountName(account) {
  return account.displayName || account.nickname || `Conta ${account.userId || ''}`.trim();
}

function productAccountOptionLabel(account) {
  return `${productAccountName(account)} (${account.userId})`;
}

function money(value, decimalPlaces = 2) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: decimalPlaces,
    maximumFractionDigits: decimalPlaces
  }).format(Number(value || 0));
}

function preciseCostText(value) {
  const number = Number(value);
  return Number.isFinite(number) ? String(number).replace('.', ',') : '';
}

function displayedCostText(value, decimalPlaces) {
  const number = Number(value);
  return Number.isFinite(number)
    ? new Intl.NumberFormat('pt-BR', {
        minimumFractionDigits: decimalPlaces,
        maximumFractionDigits: decimalPlaces
      }).format(number)
    : '';
}

function parseCostText(value) {
  const input = String(value || '')
    .trim()
    .replace(/[\s\u00a0]/gu, '');
  if (!input) return 0;
  const normalized = input.includes(',') ? input.replace(/\./gu, '').replace(',', '.') : input;
  if (!/^\d+(?:\.\d+)?$/u.test(normalized)) return null;
  const number = Number(normalized);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function ProductCostField({ value, decimalPlaces, disabled, onChange }) {
  const [focused, setFocused] = useState(false);
  const [text, setText] = useState(() => preciseCostText(value));

  useEffect(() => {
    if (!focused) setText(preciseCostText(value));
  }, [focused, value]);

  function finish() {
    const parsed = parseCostText(text);
    if (parsed !== null) onChange(parsed);
    setFocused(false);
  }

  return (
    <Input
      label="Custo do produto"
      value={focused ? text : displayedCostText(value, decimalPlaces)}
      inputMode="decimal"
      startAddon="R$"
      disabled={disabled}
      onFocus={() => {
        setText(preciseCostText(value));
        setFocused(true);
      }}
      onBlur={finish}
      onChange={(event) => setText(event.target.value.replace(/[^\d,.-]/gu, ''))}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
      }}
    />
  );
}

function customCostSummary(cost, decimalPlaces) {
  const value =
    cost.type === 'percentage'
      ? `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(Number(cost.value || 0))}%`
      : money(cost.value, decimalPlaces);
  return { description: cost.description.trim() || 'Novo custo', value };
}

function ProductChipFilter({ ariaLabel, icon, options, value, selected, width, onChange }) {
  const current = options.find((option) => option.value === value) || options[0];
  return (
    <Popover
      ariaLabel={ariaLabel}
      placement="bottom"
      align="start"
      width={width}
      padding="var(--ob-space-12)"
      closeButton={false}
      trigger={<Chip icon={icon} label={current.label} size="md" selected={selected} />}
    >
      {(close) => (
        <div className="onframe-products-filter-options" role="group" aria-label={ariaLabel}>
          {options.map((option) => (
            <Chip
              key={option.value}
              label={option.label}
              size="sm"
              selected={value === option.value}
              onToggle={() => {
                onChange(option.value);
                close();
              }}
            />
          ))}
        </div>
      )}
    </Popover>
  );
}

function ProductSku({ sku }) {
  const [copiedSku, setCopiedSku] = useState(null);
  const resetTimer = useRef(null);
  const copied = copiedSku === sku;

  useEffect(() => () => clearTimeout(resetTimer.current), []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(sku);
      clearTimeout(resetTimer.current);
      setCopiedSku(sku);
      resetTimer.current = setTimeout(() => setCopiedSku(null), 1500);
      toast({ tone: 'success', title: 'SKU copiado.' });
    } catch {
      clearTimeout(resetTimer.current);
      setCopiedSku(null);
      toast({ tone: 'danger', title: 'Não foi possível copiar o SKU.' });
    }
  };

  return (
    <Tooltip label="Copiar SKU" placement="top">
      <Button
        kind="quiet"
        tone="primary"
        fill={false}
        size="sm"
        aria-label={`Copiar SKU ${sku}`}
        onClick={() => void copy()}
        style={{
          minHeight: 24,
          maxWidth: '100%',
          justifyContent: 'flex-start',
          gap: 'var(--ob-space-4)',
          padding: 0,
          fontFamily: 'var(--ob-font-mono)',
          fontSize: 'var(--ob-fs-12)'
        }}
      >
        <span className="onframe-product-sku-value">{sku}</span>
        <Ph n={copied ? 'check' : 'copy'} size={13} c={copied ? 'var(--ob-success)' : undefined} />
      </Button>
    </Tooltip>
  );
}

function ProductForm({ product, accounts, admin, busy, costDecimalPlaces, onClose, onSaved }) {
  const [values, setValues] = useState(() =>
    product
      ? {
          sku: product.sku,
          name: product.name,
          cost: product.cost,
          taxRate: product.taxRate,
          minimumContributionMargin: product.minimumContributionMargin ?? null,
          accountTaxRates: (product.accountTaxRates || []).map((rate) => ({ ...rate, key: accountTaxRateKey() })),
          customCosts: (product.customCosts || []).map((cost) => ({ ...cost, key: customCostKey() })),
          status: product.status
        }
      : EMPTY_FORM
  );
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
  const updateCustomCost = (key, field, value) =>
    setValues((state) => ({
      ...state,
      customCosts: state.customCosts.map((cost) => (cost.key === key ? { ...cost, [field]: value } : cost))
    }));
  const removeCustomCost = (key) => {
    setValues((state) => ({
      ...state,
      customCosts: state.customCosts.filter((cost) => cost.key !== key)
    }));
    setSelectedCustomCostKey((selected) => (selected === key ? null : selected));
  };
  const selectedCustomCost = values.customCosts.find((cost) => cost.key === selectedCustomCostKey) || null;
  const addAccountTaxRate = () => {
    const account = accounts.find(
      (candidate) => !values.accountTaxRates.some((rate) => rate.sellerAccountId === candidate.id)
    );
    if (!account) return;
    setValues((state) => ({
      ...state,
      accountTaxRates: [
        ...state.accountTaxRates,
        { key: accountTaxRateKey(), sellerAccountId: account.id, accountUserId: account.userId, taxRate: 0 }
      ]
    }));
  };
  const updateAccountTaxRate = (key, field, value) =>
    setValues((state) => ({
      ...state,
      accountTaxRates: state.accountTaxRates.map((rate) => (rate.key === key ? { ...rate, [field]: value } : rate))
    }));
  const removeAccountTaxRate = (key) =>
    setValues((state) => ({
      ...state,
      accountTaxRates: state.accountTaxRates.filter((rate) => rate.key !== key)
    }));

  async function save() {
    if (!values.sku.trim() || !values.name.trim()) {
      setError('Informe o SKU e o nome do produto.');
      return;
    }
    if (values.customCosts.some((cost) => !cost.description.trim())) {
      setError('Informe a descrição de todos os custos personalizados.');
      return;
    }
    if (new Set(values.accountTaxRates.map((rate) => rate.sellerAccountId)).size !== values.accountTaxRates.length) {
      setError('Cada conta pode ter apenas uma alíquota específica.');
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
        accountTaxRates: values.accountTaxRates.map(({ sellerAccountId, taxRate }) => ({ sellerAccountId, taxRate })),
        customCosts: values.customCosts.map(({ description, type, value }) => ({
          description: description.trim(),
          type,
          value
        }))
      };
      const result = await sendRemoteMessage(current ? 'product-update' : 'product-create', {
        productId: current?.id,
        payload
      });
      setCurrent(result);
      onSaved(result);
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
      footer={
        <>
          <Button kind="secondary" disabled={locked} onClick={onClose}>
            {admin ? 'Cancelar' : 'Fechar'}
          </Button>
          {admin && (
            <Button disabled={locked} onClick={() => void save()} icon={<Ph n="floppy-disk" size={17} />}>
              {current ? 'Salvar alterações' : 'Criar produto'}
            </Button>
          )}
        </>
      }
    >
      <div className="onframe-product-drawer">
        {error && (
          <div className="onframe-product-form-error">
            <Alert appearance="soft" tone="danger" dismissible onClose={() => setError('')}>
              {error}
            </Alert>
          </div>
        )}
        <section className="onframe-product-form-section">
          <h3>Identificação</h3>
          <div className="onframe-product-form-fields">
            <Input
              label="Nome"
              value={values.name}
              maxLength={160}
              disabled={!admin || locked}
              onChange={(event) => setField('name', event.target.value)}
            />
            <Input
              label="SKU"
              value={values.sku}
              maxLength={80}
              disabled={!admin || locked}
              onChange={(event) => setField('sku', event.target.value)}
            />
          </div>
        </section>

        <section className="onframe-product-form-section">
          <h3>Custos</h3>
          <div className="onframe-product-cost-grid">
            <ProductCostField
              value={values.cost}
              decimalPlaces={costDecimalPlaces}
              disabled={!admin || locked}
              onChange={(value) => setField('cost', value)}
            />
          </div>
          <div className="onframe-product-custom-costs">
            <div className="onframe-product-custom-costs-header">
              <strong>Custos personalizados</strong>
              {admin && (
                <Button
                  kind="quiet"
                  tone="primary"
                  size="sm"
                  disabled={locked}
                  icon={<Ph n="plus-circle" size={15} />}
                  onClick={addCustomCost}
                >
                  Adicionar custo
                </Button>
              )}
            </div>
            {values.customCosts.length === 0 && (
              <p className="onframe-product-custom-costs-empty">Nenhum custo personalizado.</p>
            )}
            {values.customCosts.length > 0 && (
              <div className="onframe-product-custom-cost-chips" aria-label="Custos personalizados">
                {values.customCosts.map((cost) => {
                  const summary = customCostSummary(cost, costDecimalPlaces);
                  return (
                    <Chip
                      key={cost.key}
                      label={
                        <span className="onframe-product-custom-cost-chip-label">
                          <span className="onframe-product-custom-cost-chip-name">{summary.description}</span>
                          <span className="onframe-product-custom-cost-chip-value">{summary.value}</span>
                        </span>
                      }
                      aria-label={`Editar custo ${summary.description}: ${summary.value}`}
                      title={`${summary.description}: ${summary.value}`}
                      size="md"
                      selected={selectedCustomCostKey === cost.key}
                      onToggle={() => setSelectedCustomCostKey((selected) => (selected === cost.key ? null : cost.key))}
                      removable={admin}
                      onRemove={admin ? () => removeCustomCost(cost.key) : undefined}
                      disabled={locked}
                    />
                  );
                })}
              </div>
            )}
            {selectedCustomCost && (
              <div className="onframe-product-custom-cost-editor">
                <Input
                  label="Descrição do custo"
                  value={selectedCustomCost.description}
                  maxLength={120}
                  disabled={!admin || locked}
                  onChange={(event) => updateCustomCost(selectedCustomCost.key, 'description', event.target.value)}
                />
                <div className="onframe-product-custom-cost-value">
                  <ButtonGroup
                    selection="single"
                    value={selectedCustomCost.type}
                    onChange={(value) => updateCustomCost(selectedCustomCost.key, 'type', value)}
                    ariaLabel="Tipo do custo"
                    disabled={!admin || locked}
                  >
                    <ToggleButton value="fixed" appearance="ghost" tone="primary">
                      R$
                    </ToggleButton>
                    <ToggleButton value="percentage" appearance="ghost" tone="primary">
                      %
                    </ToggleButton>
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
              </div>
            )}
          </div>
        </section>

        <section className="onframe-product-form-section">
          <h3>Margem de contribuição</h3>
          <NumberField
            label="MC mínima do produto"
            hint="Deixe vazio para usar a MC mínima padrão do workspace."
            value={values.minimumContributionMargin}
            min={0}
            max={100}
            decimals={2}
            step={0.01}
            controls="none"
            endAddon="%"
            width={240}
            disabled={!admin || locked}
            onChange={(value) => setField('minimumContributionMargin', value)}
          />
        </section>

        <section className="onframe-product-form-section">
          <h3>Impostos</h3>
          <div className="onframe-product-tax-default">
            <NumberField
              label="Alíquota específica do produto"
              hint="Deixe vazio para herdar a alíquota da conta ou do workspace."
              value={values.taxRate}
              min={0}
              max={100}
              decimals={2}
              step={0.01}
              controls="none"
              endAddon="%"
              disabled={!admin || locked}
              onChange={(value) => setField('taxRate', value)}
            />
          </div>
          <div className="onframe-product-account-taxes">
            <div className="onframe-product-custom-costs-header">
              <div>
                <strong>Exceções por conta</strong>
                <p>Substituem a alíquota geral deste produto somente na conta escolhida.</p>
              </div>
              {admin && accounts.length > values.accountTaxRates.length && (
                <Button
                  kind="quiet"
                  tone="primary"
                  size="sm"
                  disabled={locked}
                  icon={<Ph n="plus-circle" size={15} />}
                  onClick={addAccountTaxRate}
                >
                  Adicionar exceção
                </Button>
              )}
            </div>
            {values.accountTaxRates.length === 0 && (
              <p className="onframe-product-custom-costs-empty">Nenhuma exceção configurada.</p>
            )}
            {values.accountTaxRates.map((rate) => {
              const selectedAccount = accounts.find((account) => account.id === rate.sellerAccountId);
              const accountOptions = accounts
                .filter(
                  (account) =>
                    account.id === rate.sellerAccountId ||
                    !values.accountTaxRates.some((entry) => entry.sellerAccountId === account.id)
                )
                .map((account) => ({ label: productAccountOptionLabel(account), id: account.id }));
              return (
                <div className="onframe-product-account-tax-row" key={rate.key}>
                  <Select
                    label="Conta"
                    options={accountOptions}
                    value={selectedAccount ? productAccountOptionLabel(selectedAccount) : null}
                    disabled={!admin || locked}
                    onChange={(label) => {
                      const account = accounts.find((candidate) => productAccountOptionLabel(candidate) === label);
                      if (account) updateAccountTaxRate(rate.key, 'sellerAccountId', account.id);
                    }}
                  />
                  <NumberField
                    label="Alíquota"
                    value={rate.taxRate}
                    min={0}
                    max={100}
                    decimals={2}
                    step={0.01}
                    controls="none"
                    endAddon="%"
                    disabled={!admin || locked}
                    onChange={(value) => updateAccountTaxRate(rate.key, 'taxRate', value ?? 0)}
                  />
                  {admin && (
                    <Button
                      kind="quiet"
                      tone="danger"
                      size="sm"
                      iconOnly
                      aria-label={`Remover exceção de ${selectedAccount ? productAccountName(selectedAccount) : 'conta'}`}
                      disabled={locked}
                      icon={<Ph n="trash" size={16} />}
                      onClick={() => removeAccountTaxRate(rate.key)}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </section>

        <section className="onframe-product-form-section">
          <h3>Situação</h3>
          <div className="onframe-product-status-row">
            <strong>{values.status === 'deleted' ? 'Produto excluído' : 'Produto ativo'}</strong>
            <Switch
              checked={values.status === 'active'}
              label={values.status === 'active' ? 'Ativo' : values.status === 'deleted' ? 'Excluído' : 'Inativo'}
              disabled={!admin || locked}
              onChange={(checked) => setField('status', checked ? 'active' : 'inactive')}
            />
          </div>
        </section>
      </div>
    </Drawer>
  );
}

const BULK_FIELDS = [
  { name: 'status', label: 'Situação', icon: 'toggle-right' },
  { name: 'cost', label: 'Custo', icon: 'currency-circle-dollar' },
  { name: 'taxRate', label: 'Imposto', icon: 'percent' },
  { name: 'minimumContributionMargin', label: 'Margem mínima', icon: 'chart-line-up' }
];

function ProductBulkEditor({
  products,
  selectionCount,
  globalSelection,
  costDecimalPlaces,
  initialField,
  busy,
  error,
  onClose,
  onApply
}) {
  const [fields, setFields] = useState(initialField ? [initialField] : []);
  const [status, setStatus] = useState(null);
  const [cost, setCost] = useState(null);
  const [taxMode, setTaxMode] = useState('define');
  const [taxRate, setTaxRate] = useState(null);
  const [marginMode, setMarginMode] = useState('define');
  const [minimumMargin, setMinimumMargin] = useState(null);

  useEffect(() => {
    if (!initialField) return undefined;
    const timer = window.setTimeout(() => {
      document.getElementById(`bulk-field-${initialField}`)?.querySelector('input')?.focus({ preventScroll: true });
    }, 280);
    return () => window.clearTimeout(timer);
  }, [initialField]);

  const enabled = BULK_FIELDS.filter((field) => fields.includes(field.name));
  const canApply =
    enabled.length > 0 &&
    (!fields.includes('status') || status !== null) &&
    (!fields.includes('cost') || cost !== null) &&
    (!fields.includes('taxRate') || taxMode === 'inherit' || taxRate !== null) &&
    (!fields.includes('minimumContributionMargin') || marginMode === 'inherit' || minimumMargin !== null);
  const costs = products.map((product) => product.cost);
  const costSummary = globalSelection
    ? ''
    : Math.min(...costs) === Math.max(...costs)
      ? `Hoje: ${money(costs[0], costDecimalPlaces)}`
      : `Hoje: de ${money(Math.min(...costs), costDecimalPlaces)} a ${money(Math.max(...costs), costDecimalPlaces)}`;

  function apply() {
    const changes = {};
    if (fields.includes('status')) changes.status = status;
    if (fields.includes('cost')) changes.cost = cost;
    if (fields.includes('taxRate')) changes.taxRate = taxMode === 'inherit' ? null : taxRate;
    if (fields.includes('minimumContributionMargin')) {
      changes.minimumContributionMargin = marginMode === 'inherit' ? null : minimumMargin;
    }
    onApply(changes);
  }

  function field(name, description, children) {
    const definition = BULK_FIELDS.find((item) => item.name === name);
    return (
      <section className="onframe-product-bulk-field" id={`bulk-field-${name}`} key={name}>
        <div className="onframe-product-bulk-field-heading">
          <div>
            <strong>
              <Ph n={definition.icon} size={18} />
              {definition.label}
            </strong>
            {description && <span>{description}</span>}
          </div>
          <Button
            kind="quiet"
            size="sm"
            iconOnly
            aria-label={`Não mudar ${definition.label.toLowerCase()}`}
            icon={<Ph n="x" size={16} />}
            disabled={busy}
            onClick={() => setFields((current) => current.filter((item) => item !== name))}
          />
        </div>
        <div className="onframe-product-bulk-field-controls">{children}</div>
      </section>
    );
  }

  return (
    <Drawer
      open
      onClose={busy ? () => {} : onClose}
      title={`Editar ${selectionCount} ${selectionCount === 1 ? 'produto' : 'produtos'}`}
      side="right"
      width={520}
      footer={
        <div className="onframe-product-bulk-footer">
          <span>
            {enabled.length
              ? `Mudar ${enabled.map((field) => field.label.toLowerCase()).join(', ')} em ${selectionCount} ${selectionCount === 1 ? 'produto' : 'produtos'}.`
              : 'Escolha o que você quer mudar.'}
          </span>
          <div>
            <Button kind="secondary" disabled={busy} onClick={onClose}>
              Cancelar
            </Button>
            <Button loading={busy} disabled={!canApply} onClick={apply}>
              Aplicar
            </Button>
          </div>
        </div>
      }
    >
      <div className="onframe-product-bulk-editor">
        {error && (
          <Alert appearance="soft" tone="danger">
            {error}
          </Alert>
        )}
        <strong className="onframe-product-bulk-picker-label">O que mudar</strong>
        <div className="onframe-product-bulk-picker">
          <ButtonGroup
            selection="multiple"
            attached={false}
            fullWidth
            size="sm"
            value={fields}
            disabled={busy}
            onChange={(value) =>
              setFields(BULK_FIELDS.map((item) => item.name).filter((name) => (value || []).includes(name)))
            }
            ariaLabel="O que mudar"
            style={{ gap: 'var(--ob-space-4)' }}
          >
            {BULK_FIELDS.map((item) => (
              <ToggleButton
                key={item.name}
                value={item.name}
                icon={item.name === 'status' ? 'toggle-left' : item.icon}
                pressedIcon={item.name === 'status' ? 'toggle-right' : undefined}
                appearance="ghost"
                tone="neutral"
                fillWhenPressed
                style={{
                  gap: 'var(--onframe-bulk-toggle-gap)',
                  paddingInline: 'var(--onframe-bulk-toggle-px)',
                  whiteSpace: 'nowrap'
                }}
              >
                {item.name === 'minimumContributionMargin' ? (
                  <>
                    Margem<span className="onframe-product-bulk-margin-suffix"> mínima</span>
                  </>
                ) : (
                  item.label
                )}
              </ToggleButton>
            ))}
          </ButtonGroup>
        </div>
        <p className="onframe-product-bulk-hint">O resto de cada produto fica como está.</p>
        {fields.includes('status') &&
          field(
            'status',
            globalSelection
              ? ''
              : `Hoje: ${products.filter((product) => product.status === 'active').length} ativos e ${products.filter((product) => product.status === 'inactive').length} inativos`,
            <ButtonGroup
              selection="single"
              fullWidth
              value={status}
              disabled={busy}
              onChange={(value) => value && setStatus(value)}
              ariaLabel="Nova situação"
            >
              <ToggleButton value="active" icon="play-circle" appearance="ghost" tone="success" fillWhenPressed>
                Ativo
              </ToggleButton>
              <ToggleButton value="inactive" icon="pause-circle" appearance="ghost" tone="warning" fillWhenPressed>
                Inativo
              </ToggleButton>
            </ButtonGroup>
          )}
        {fields.includes('cost') &&
          field(
            'cost',
            costSummary,
            <div className="onframe-product-bulk-input">
              <NumberField
                ariaLabel="Novo custo"
                value={cost}
                disabled={busy}
                min={0}
                decimals={8}
                controls="none"
                startAddon="R$"
                align="right"
                width="100%"
                onChange={setCost}
              />
            </div>
          )}
        {fields.includes('taxRate') &&
          field(
            'taxRate',
            'Exceções por conta permanecem inalteradas.',
            <>
              <ButtonGroup
                selection="single"
                fullWidth
                value={taxMode}
                disabled={busy}
                onChange={(value) => value && setTaxMode(value)}
                ariaLabel="Como definir o imposto"
              >
                <ToggleButton value="define" appearance="ghost" tone="primary" icon="equals" fillWhenPressed>
                  Definir
                </ToggleButton>
                <ToggleButton
                  value="inherit"
                  appearance="ghost"
                  tone="neutral"
                  icon="arrow-counter-clockwise"
                  fillWhenPressed
                >
                  Herdar
                </ToggleButton>
              </ButtonGroup>
              {taxMode === 'define' && (
                <div className="onframe-product-bulk-input">
                  <NumberField
                    ariaLabel="Alíquota"
                    value={taxRate}
                    disabled={busy}
                    min={0}
                    max={100}
                    decimals={2}
                    controls="none"
                    endAddon="%"
                    align="right"
                    width="100%"
                    onChange={setTaxRate}
                  />
                </div>
              )}
            </>
          )}
        {fields.includes('minimumContributionMargin') &&
          field(
            'minimumContributionMargin',
            'Cada produto pode usar um limite próprio ou o padrão do workspace.',
            <>
              <ButtonGroup
                selection="single"
                fullWidth
                value={marginMode}
                disabled={busy}
                onChange={(value) => value && setMarginMode(value)}
                ariaLabel="Como definir a margem mínima"
              >
                <ToggleButton value="define" appearance="ghost" tone="primary" icon="equals" fillWhenPressed>
                  Definir
                </ToggleButton>
                <ToggleButton
                  value="inherit"
                  appearance="ghost"
                  tone="neutral"
                  icon="arrow-counter-clockwise"
                  fillWhenPressed
                >
                  Usar padrão
                </ToggleButton>
              </ButtonGroup>
              {marginMode === 'define' && (
                <div className="onframe-product-bulk-input">
                  <NumberField
                    ariaLabel="Margem mínima"
                    value={minimumMargin}
                    disabled={busy}
                    min={0}
                    max={100}
                    decimals={2}
                    controls="none"
                    endAddon="%"
                    align="right"
                    width="100%"
                    onChange={setMinimumMargin}
                  />
                </div>
              )}
            </>
          )}
      </div>
    </Drawer>
  );
}

export function Products({ accounts = [], admin, canDelete = admin, onHeaderActionsChange }) {
  const { atLeast } = useBreakpoint();
  const wideBar = atLeast('lg');
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
  const [costDecimalPlaces, setCostDecimalPlaces] = useState(2);
  const [selectedIds, setSelectedIds] = useState([]);
  const [globalSelection, setGlobalSelection] = useState(null);
  const [pendingSelection, setPendingSelection] = useState(null);
  const [activeJob, setActiveJob] = useState(null);
  const [failureDrawerOpen, setFailureDrawerOpen] = useState(false);
  const [bulkEditorOpen, setBulkEditorOpen] = useState(false);
  const [bulkConfirmation, setBulkConfirmation] = useState(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkError, setBulkError] = useState('');
  const requestSequence = useRef(0);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedQuery(query.trim()), 250);
    return () => window.clearTimeout(timeout);
  }, [query]);

  const load = useCallback(
    async (page = 1) => {
      const sequence = ++requestSequence.current;
      setLoading(true);
      setError('');
      try {
        const result = await sendRemoteMessage('products', {
          query: { q: debouncedQuery, status, sort, page, limit: PAGE_SIZE, selectionId: globalSelection?.id }
        });
        if (sequence !== requestSequence.current) return;
        setProducts(result.products || []);
        setPagination(result.pagination || { page, total: 0, totalPages: 1 });
        setCostDecimalPlaces(result.settings?.costDecimalPlaces ?? 2);
      } catch (failure) {
        if (sequence !== requestSequence.current) return;
        setError(userError(failure, 'Não foi possível carregar os produtos.'));
      } finally {
        if (sequence === requestSequence.current) setLoading(false);
      }
    },
    [debouncedQuery, sort, status, globalSelection?.id]
  );

  useEffect(() => {
    setSelectedIds([]);
    setGlobalSelection(null);
    setPendingSelection(null);
  }, [debouncedQuery, status]);

  useEffect(() => {
    setSelectedIds([]);
    setPendingSelection(null);
  }, [sort]);

  useEffect(() => {
    void load(1);
  }, [load]);

  useEffect(() => {
    let mounted = true;
    void sendRemoteMessage('products-bulk-latest')
      .then((job) => {
        if (mounted && job?.id) setActiveJob(job);
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  const selectedProducts = products.filter((product) => globalSelection || selectedIds.includes(product.id));
  const selectionCount = globalSelection?.total || selectedProducts.length;
  const selectionOpen = selectionCount > 0;
  const jobRunning = activeJob && ['queued', 'running'].includes(activeJob.status);

  useEffect(() => {
    if (activeJob?.status !== 'completed') return undefined;
    const id = activeJob.id;
    const timer = window.setTimeout(() => {
      setActiveJob((current) => (current?.id === id ? null : current));
    }, 5000);
    return () => window.clearTimeout(timer);
  }, [activeJob?.id, activeJob?.status]);

  function clearSelection() {
    setSelectedIds([]);
    setGlobalSelection(null);
    setPendingSelection(null);
  }

  useEffect(() => {
    if (!jobRunning) return undefined;
    let mounted = true;
    let polling = false;
    const poll = async () => {
      if (polling) return;
      polling = true;
      try {
        const job = await sendRemoteMessage('products-bulk-job', { jobId: activeJob.id });
        if (!mounted) return;
        setActiveJob(job);
        if (!['queued', 'running'].includes(job.status)) void load(pagination.page);
      } catch (failure) {
        if (mounted) setError(userError(failure, 'Não foi possível consultar o andamento da edição.'));
      } finally {
        polling = false;
      }
    };
    const timer = window.setInterval(() => void poll(), 1500);
    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, [activeJob?.id, jobRunning, load, pagination.page]);

  useEffect(() => {
    if (!selectionOpen || bulkEditorOpen || bulkConfirmation || dialog) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') clearSelection();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectionOpen, bulkEditorOpen, bulkConfirmation, dialog]);

  async function applyBulk(action, changes) {
    setBulkBusy(true);
    setBulkError('');
    setError('');
    const key = globalSelection?.id || [...selectedIds].sort().join('|');
    let selection = globalSelection || (pendingSelection?.key === key ? pendingSelection : null);
    const showStartedJob = (job) => {
      setActiveJob(job);
      setBulkEditorOpen(false);
      setBulkConfirmation(null);
      clearSelection();
    };
    try {
      if (!selection) {
        selection = await sendRemoteMessage('products-bulk-selection', {
          payload: { ids: selectedIds }
        });
        setPendingSelection({ ...selection, key });
      }
      const job = await sendRemoteMessage('products-bulk-start', {
        jobId: selection.id,
        payload: { action, ...(changes ? { changes } : {}) }
      });
      showStartedJob(job);
    } catch (failure) {
      if (selection) {
        try {
          const job = await sendRemoteMessage('products-bulk-job', { jobId: selection.id });
          if (job.status !== 'selected') {
            showStartedJob(job);
            return;
          }
        } catch {
          // Keep the selection ID so a retry cannot create a duplicate job.
        }
      }
      const message = userError(failure);
      setBulkError(message);
      if (!bulkEditorOpen && !bulkConfirmation) setError(message);
    } finally {
      setBulkBusy(false);
    }
  }

  async function exportSelected() {
    if (!globalSelection) return downloadProductExport(selectedProducts);
    setExportBusy(true);
    try {
      const catalog = [];
      let page = 1;
      let totalPages = 1;
      do {
        const result = await sendRemoteMessage('products', {
          query: { selectionId: globalSelection.id, page, limit: 100 }
        });
        catalog.push(...(result.products || []));
        totalPages = result.pagination?.totalPages || 1;
        page += 1;
      } while (page <= totalPages);
      downloadProductExport(catalog);
    } catch (failure) {
      setError(userError(failure, 'Não foi possível exportar os produtos selecionados.'));
    } finally {
      setExportBusy(false);
    }
  }

  async function selectAllFiltered() {
    setBulkBusy(true);
    setError('');
    try {
      const selection = await sendRemoteMessage('products-bulk-selection', {
        payload: { filter: { q: debouncedQuery, status } }
      });
      setPendingSelection(null);
      setGlobalSelection(selection);
    } catch (failure) {
      setError(userError(failure, 'Não foi possível selecionar todos os produtos.'));
    } finally {
      setBulkBusy(false);
    }
  }

  async function retryBulkFailures() {
    setBulkBusy(true);
    try {
      const job = await sendRemoteMessage('products-bulk-retry', { jobId: activeJob.id });
      setActiveJob(job);
      setFailureDrawerOpen(false);
    } catch (failure) {
      setError(userError(failure, 'Não foi possível tentar novamente.'));
    } finally {
      setBulkBusy(false);
    }
  }

  async function failurePage(page) {
    try {
      const job = await sendRemoteMessage('products-bulk-job', { jobId: activeJob.id, failedPage: page });
      setActiveJob(job);
    } catch (failure) {
      setError(userError(failure, 'Não foi possível carregar as falhas.'));
    }
  }

  function openBulkEditor(field = true) {
    setBulkError('');
    setBulkEditorOpen(field);
  }

  function reflectProduct(product) {
    setProducts((items) => items.map((item) => (item.id === product.id ? product : item)));
    void load(pagination.page);
  }

  async function archive(product) {
    setLoading(true);
    setDialog((current) => (current?.type === 'archive' ? { ...current, error: '' } : current));
    try {
      await sendRemoteMessage('product-archive', { productId: product.id });
      setDialog(null);
      setProducts((items) => items.filter((item) => item.id !== product.id));
      await load(Math.min(pagination.page, Math.max(1, pagination.totalPages)));
    } catch (failure) {
      setDialog((current) => (current?.type === 'archive' ? { ...current, error: userError(failure) } : current));
    } finally {
      setLoading(false);
    }
  }

  async function restore(product) {
    setLoading(true);
    setError('');
    try {
      await sendRemoteMessage('product-restore', { productId: product.id });
      await load(pagination.page);
    } catch (failure) {
      setError(userError(failure));
    } finally {
      setLoading(false);
    }
  }

  async function permanentlyDelete(product) {
    setLoading(true);
    setDialog((current) => (current?.type === 'permanent' ? { ...current, error: '' } : current));
    try {
      await sendRemoteMessage('product-delete-permanent', { productId: product.id });
      setDialog(null);
      await load(pagination.page);
    } catch (failure) {
      setDialog((current) => (current?.type === 'permanent' ? { ...current, error: userError(failure) } : current));
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
        >
          {exportBusy ? 'Gerando planilha...' : 'Baixar planilha'}
        </Button>
        {admin && (
          <Button
            kind="secondary"
            icon={<Ph n="upload-simple" size={17} />}
            onClick={() => setDialog({ type: 'import' })}
          >
            Importar
          </Button>
        )}
        {admin && (
          <Button icon={<Ph n="plus-circle" size={17} />} onClick={() => setDialog({ type: 'product', product: null })}>
            Criar produto
          </Button>
        )}
      </div>
    );
    return undefined;
  }, [admin, exportBusy, exportCatalog, onHeaderActionsChange]);

  function imported() {
    void load(1);
  }

  const columns = [
    { key: 'name', label: 'Produto', bold: true, render: (value) => <p className="onframe-list-title">{value}</p> },
    { key: 'sku', label: 'SKU', width: 220, render: (value) => <ProductSku sku={String(value || '')} /> },
    { key: 'cost', label: 'Custo', width: 135, render: (value) => money(value, costDecimalPlaces) },
    {
      key: 'taxRate',
      label: 'Imposto',
      width: 105,
      render: (value) =>
        value === null ? 'Herdado' : `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(value)}%`
    },
    {
      key: 'minimumContributionMargin',
      label: 'MC mínima',
      width: 112,
      render: (value) =>
        value === null || value === undefined
          ? 'Global'
          : `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(value)}%`
    },
    {
      key: 'actions',
      label: '',
      width: 56,
      render: (_, product) => (
        <div className="onframe-product-action-menu">
          <Popover
            placement="bottom"
            align="end"
            width={196}
            padding={0}
            closeButton={false}
            ariaLabel={`Ações de ${product.name}`}
            trigger={
              <Button
                kind="quiet"
                size="sm"
                iconOnly
                aria-label={`Abrir ações de ${product.name}`}
                disabled={loading}
                icon={<Ph n="dots-three-vertical" size={18} />}
              />
            }
          >
            {(close) => (
              <MenuPanel
                size="sm"
                ariaLabel={`Ações de ${product.name}`}
                onCloseTree={close}
                items={[
                  {
                    label: admin && product.status !== 'deleted' ? 'Editar produto' : 'Ver detalhes',
                    icon: admin && product.status !== 'deleted' ? 'pencil-simple' : 'eye',
                    disabled: loading,
                    onSelect: () => setDialog({ type: 'product', product })
                  },
                  ...(canDelete
                    ? [
                        { type: 'separator' },
                        ...(product.status === 'deleted'
                          ? [
                              {
                                label: 'Restaurar produto',
                                icon: 'arrow-counter-clockwise',
                                disabled: loading,
                                onSelect: () => void restore(product)
                              },
                              {
                                label: 'Excluir definitivamente',
                                icon: 'trash',
                                tone: 'danger',
                                disabled: loading,
                                onSelect: () => setDialog({ type: 'permanent', product })
                              }
                            ]
                          : [
                              {
                                label: 'Excluir produto',
                                icon: 'trash',
                                tone: 'danger',
                                disabled: loading,
                                onSelect: () => setDialog({ type: 'archive', product })
                              }
                            ])
                      ]
                    : [])
                ]}
                style={{ minWidth: 196, border: 'none', boxShadow: 'none' }}
              />
            )}
          </Popover>
        </div>
      )
    }
  ];

  const statusActions =
    admin && status !== 'deleted'
      ? [
          ...((
            globalSelection ? status !== 'active' : selectedProducts.some((product) => product.status === 'inactive')
          )
            ? [{ label: 'Ativar', icon: 'play-circle', tone: 'success', value: 'active' }]
            : []),
          ...((
            globalSelection ? status !== 'inactive' : selectedProducts.some((product) => product.status === 'active')
          )
            ? [{ label: 'Inativar', icon: 'pause-circle', tone: 'warning', value: 'inactive' }]
            : [])
        ]
      : [];
  const canSelectPage = !globalSelection && selectedProducts.length < products.length;
  const canSelectFiltered = !globalSelection && !canSelectPage && pagination.total > products.length;
  const selectPageAction =
    canSelectPage && !wideBar
      ? [
          {
            label: 'Selecionar todos da página',
            icon: 'checks',
            onSelect: () => setSelectedIds(products.map((product) => product.id))
          }
        ]
      : [];
  const selectFilteredAction =
    canSelectFiltered && !wideBar
      ? [
          {
            label: `Selecionar todos os ${pagination.total} produtos`,
            icon: 'checks',
            onSelect: () => void selectAllFiltered()
          }
        ]
      : [];
  const bulkMenuItems =
    status === 'deleted'
      ? [
          ...selectPageAction,
          ...selectFilteredAction,
          ...(canDelete
            ? [
                ...(selectPageAction.length ? [{ type: 'separator' }] : []),
                {
                  label: 'Excluir definitivamente',
                  icon: 'trash',
                  tone: 'danger',
                  onSelect: () => setBulkConfirmation('permanent')
                }
              ]
            : [])
        ]
      : [
          ...selectPageAction,
          ...selectFilteredAction,
          ...(!wideBar
            ? statusActions.map((action) => ({
                label: action.label,
                icon: action.icon,
                tone: action.tone,
                onSelect: () => void applyBulk('update', { status: action.value })
              }))
            : []),
          ...(admin
            ? [
                ...(!wideBar
                  ? [
                      {
                        label: 'Alterar custo',
                        icon: 'currency-circle-dollar',
                        onSelect: () => openBulkEditor('cost')
                      },
                      { label: 'Definir imposto', icon: 'percent', onSelect: () => openBulkEditor('taxRate') }
                    ]
                  : []),
                {
                  label: 'Margem mínima',
                  icon: 'chart-line-up',
                  onSelect: () => openBulkEditor('minimumContributionMargin')
                }
              ]
            : []),
          ...(admin ? [{ label: 'Exportar planilha', icon: 'download-simple', onSelect: exportSelected }] : []),
          ...(canDelete
            ? [
                { type: 'separator' },
                { label: 'Excluir', icon: 'trash', tone: 'danger', onSelect: () => setBulkConfirmation('delete') }
              ]
            : [])
        ];

  return (
    <div className={`onframe-products onframe-stack${selectionOpen ? ' onframe-products--selection-active' : ''}`}>
      {error && (
        <Alert appearance="soft" tone="danger" dismissible onClose={() => setError('')}>
          {error}
        </Alert>
      )}
      {activeJob && (
        <Alert
          appearance="soft"
          tone={activeJob.failed ? 'warning' : activeJob.status === 'completed' ? 'success' : 'info'}
        >
          <div className="onframe-product-bulk-job-status">
            <div>
              <strong>
                {jobRunning
                  ? 'Processando produtos'
                  : activeJob.failed
                    ? 'Ação concluída com falhas'
                    : 'Ação concluída'}
              </strong>
              <span>
                {activeJob.succeeded} de {activeJob.total} concluídos
                {activeJob.failed ? ` · ${activeJob.failed} com falha` : ''}
              </span>
            </div>
            {activeJob.total > 0 && (
              <ProgressBar
                value={Math.round(((activeJob.succeeded + activeJob.failed) * 100) / activeJob.total)}
                size="sm"
              />
            )}
            {activeJob.failed > 0 && !jobRunning && (
              <Button kind="quiet" size="sm" onClick={() => setFailureDrawerOpen(true)}>
                Ver falhas
              </Button>
            )}
          </div>
        </Alert>
      )}
      <div className="onframe-products-toolbar">
        <div className="onframe-products-search">
          <SearchInput
            value={query}
            onChange={(value) => {
              clearSelection();
              setQuery(value);
            }}
            loading={loading && query !== debouncedQuery}
            placeholder="Buscar por SKU ou nome"
            ariaLabel="Buscar produtos"
            width="100%"
          />
        </div>
        <div className="onframe-products-filters">
          <ProductChipFilter
            ariaLabel="Filtrar produtos por status"
            icon="sliders-horizontal"
            options={STATUS_FILTERS}
            value={status}
            selected={status !== 'all'}
            width={240}
            onChange={(value) => {
              clearSelection();
              setStatus(value);
            }}
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
          ariaLabel="Produtos"
          columns={columns}
          rows={products}
          rowKey="id"
          selectable={!jobRunning && (status !== 'deleted' || canDelete)}
          selectedKeys={globalSelection ? products.map((product) => product.id) : selectedIds}
          onSelect={(_, keys) => {
            setGlobalSelection(null);
            setSelectedIds(keys);
            setPendingSelection(null);
          }}
          loading={loading}
          emptyState={
            <EmptyState
              icon="package"
              size="sm"
              title={
                debouncedQuery
                  ? 'Nenhum produto encontrado'
                  : status === 'deleted'
                    ? 'Nenhum produto excluído'
                    : 'Nenhum produto cadastrado'
              }
              description={
                debouncedQuery
                  ? 'Revise a busca ou os filtros aplicados.'
                  : status === 'deleted'
                    ? 'Os produtos excluídos aparecerão aqui.'
                    : 'Cadastre o primeiro produto para organizar custos e anúncios.'
              }
            />
          }
        />
      </div>
      {pagination.totalPages > 1 && (
        <div className="onframe-products-pagination">
          <span>{pagination.total} produtos</span>
          <Pagination
            size="sm"
            page={pagination.page}
            total={pagination.totalPages}
            onChange={(page) => {
              if (!globalSelection) {
                setSelectedIds([]);
                setPendingSelection(null);
              }
              void load(page);
            }}
          />
        </div>
      )}
      <div
        className={`onframe-product-bulk-dock${selectionOpen && !bulkEditorOpen && !bulkConfirmation && !dialog ? ' onframe-product-bulk-dock--open' : ''}`}
      >
        <Card elevation="shadow" padding="var(--ob-space-8)">
          <div className="onframe-product-bulk-bar" role="toolbar" aria-label="Ações em massa">
            <Tooltip label="Limpar seleção">
              <Button
                kind="quiet"
                size="sm"
                iconOnly
                aria-label="Limpar seleção"
                icon={<Ph n="x" size={16} />}
                disabled={bulkBusy}
                onClick={clearSelection}
              />
            </Tooltip>
            <strong>
              {selectionCount} {selectionCount === 1 ? 'selecionado' : 'selecionados'}
            </strong>
            {wideBar && canSelectPage && (
              <Button
                kind="quiet"
                size="sm"
                disabled={bulkBusy}
                onClick={() => setSelectedIds(products.map((product) => product.id))}
              >
                Selecionar todos da página
              </Button>
            )}
            {wideBar && canSelectFiltered && (
              <Button kind="quiet" size="sm" disabled={bulkBusy} onClick={() => void selectAllFiltered()}>
                Selecionar todos os {pagination.total} produtos
              </Button>
            )}
            {wideBar && status !== 'deleted' && admin && (
              <>
                <Divider orientation="vertical" decorative style={{ height: 20, alignSelf: 'center' }} />
                {statusActions.map((action) => (
                  <Button
                    key={action.value}
                    kind="quiet"
                    size="sm"
                    tone={action.tone}
                    icon={<Ph n={action.icon} size={16} />}
                    disabled={bulkBusy}
                    onClick={() => void applyBulk('update', { status: action.value })}
                  >
                    {action.label}
                  </Button>
                ))}
                <Button
                  kind="quiet"
                  size="sm"
                  icon={<Ph n="currency-circle-dollar" size={16} />}
                  disabled={bulkBusy}
                  onClick={() => openBulkEditor('cost')}
                >
                  Alterar custo
                </Button>
                <Button
                  kind="quiet"
                  size="sm"
                  icon={<Ph n="percent" size={16} />}
                  disabled={bulkBusy}
                  onClick={() => openBulkEditor('taxRate')}
                >
                  Definir imposto
                </Button>
              </>
            )}
            {bulkMenuItems.length > 0 && (
              <Menu
                placement="top"
                align="right"
                size="sm"
                ariaLabel="Mais ações em massa"
                items={bulkMenuItems}
                trigger={
                  <Button
                    kind="quiet"
                    size="sm"
                    iconOnly
                    aria-label="Mais ações em massa"
                    icon={<Ph n="dots-three" size={18} />}
                    disabled={bulkBusy}
                  />
                }
              />
            )}
            {status === 'deleted' ? (
              <Button
                size="sm"
                icon={<Ph n="arrow-counter-clockwise" size={16} />}
                disabled={bulkBusy || jobRunning || !canDelete}
                onClick={() => void applyBulk('restore')}
              >
                Restaurar
              </Button>
            ) : admin ? (
              <Button
                size="sm"
                icon={<Ph n="pencil-simple" size={16} />}
                disabled={bulkBusy || jobRunning}
                onClick={() => openBulkEditor()}
              >
                Editar {selectionCount > 1 ? `${selectionCount} produtos` : 'produto'}
              </Button>
            ) : (
              <Button
                size="sm"
                icon={<Ph n="download-simple" size={16} />}
                disabled={exportBusy}
                onClick={() => void exportSelected()}
              >
                Exportar
              </Button>
            )}
          </div>
        </Card>
      </div>
      {bulkEditorOpen && (
        <ProductBulkEditor
          products={selectedProducts}
          selectionCount={selectionCount}
          globalSelection={Boolean(globalSelection)}
          costDecimalPlaces={costDecimalPlaces}
          initialField={typeof bulkEditorOpen === 'string' ? bulkEditorOpen : null}
          busy={bulkBusy}
          error={bulkError}
          onClose={() => setBulkEditorOpen(false)}
          onApply={(changes) => void applyBulk('update', changes)}
        />
      )}
      <AlertDialog
        open={Boolean(bulkConfirmation)}
        onClose={() => setBulkConfirmation(null)}
        title={
          bulkConfirmation === 'permanent'
            ? 'Excluir definitivamente os produtos?'
            : 'Excluir os produtos selecionados?'
        }
        confirmLabel={bulkConfirmation === 'permanent' ? 'Excluir definitivamente' : 'Mover para Excluídos'}
        tone="danger"
        loading={bulkBusy}
        onConfirm={() => void applyBulk(bulkConfirmation)}
      >
        {bulkError && (
          <Alert appearance="soft" tone="danger">
            {bulkError}
          </Alert>
        )}
        {bulkConfirmation === 'permanent'
          ? `${selectionCount} produtos e seus históricos de custos serão removidos sem possibilidade de recuperação.`
          : `${selectionCount} produtos sairão do catálogo e poderão ser restaurados em Excluídos.`}
      </AlertDialog>
      <Drawer
        open={failureDrawerOpen}
        onClose={() => setFailureDrawerOpen(false)}
        title="Produtos não alterados"
        side="right"
        width={520}
        footer={
          <Button disabled={bulkBusy || !activeJob?.failed} loading={bulkBusy} onClick={() => void retryBulkFailures()}>
            Tentar novamente os {activeJob?.failed || 0} produtos
          </Button>
        }
      >
        {activeJob?.failed > 0 && (
          <div className="onframe-stack">
            <Alert appearance="soft" tone="warning">
              {activeJob.failed} {activeJob.failed === 1 ? 'produto não foi alterado' : 'produtos não foram alterados'}.
            </Alert>
            <List ariaLabel="Produtos não alterados">
              {(activeJob.failures || []).map((failure) => (
                <ListItem
                  key={failure.productId}
                  title={failure.name}
                  strong
                  wrap
                  description={`${failure.sku} · ${userError({ code: failure.errorCode }, 'Não foi possível alterar.')}`}
                />
              ))}
            </List>
            {activeJob.failed > 25 && (
              <Pagination
                size="sm"
                page={activeJob.failedPage || 1}
                total={Math.ceil(activeJob.failed / 25)}
                onChange={(page) => void failurePage(page)}
              />
            )}
          </div>
        )}
      </Drawer>
      {dialog?.type === 'product' && (
        <ProductForm
          key={dialog.product?.id || 'new'}
          product={dialog.product}
          accounts={accounts}
          admin={admin && dialog.product?.status !== 'deleted'}
          busy={loading}
          costDecimalPlaces={costDecimalPlaces}
          onClose={() => setDialog(null)}
          onSaved={reflectProduct}
        />
      )}
      {dialog?.type === 'import' && <ProductSpreadsheetModal onClose={() => setDialog(null)} onImported={imported} />}
      <Modal
        open={dialog?.type === 'archive'}
        onClose={loading ? undefined : () => setDialog(null)}
        title="Excluir produto"
        role="alertdialog"
        size="sm"
        footer={
          <>
            <Button kind="secondary" disabled={loading} onClick={() => setDialog(null)}>
              Cancelar
            </Button>
            <Button kind="danger" disabled={loading} onClick={() => void archive(dialog.product)}>
              Excluir
            </Button>
          </>
        }
      >
        <div className="onframe-stack">
          {dialog?.error && (
            <Alert appearance="soft" tone="danger">
              {dialog.error}
            </Alert>
          )}
          <p>
            O produto <strong>{dialog?.product?.name}</strong> irá para Excluídos. Você poderá restaurá-lo depois.
          </p>
        </div>
      </Modal>
      <Modal
        open={dialog?.type === 'permanent'}
        onClose={loading ? undefined : () => setDialog(null)}
        title="Excluir definitivamente"
        role="alertdialog"
        size="sm"
        footer={
          <>
            <Button kind="secondary" disabled={loading} onClick={() => setDialog(null)}>
              Cancelar
            </Button>
            <Button kind="danger" disabled={loading} onClick={() => void permanentlyDelete(dialog.product)}>
              Excluir definitivamente
            </Button>
          </>
        }
      >
        <div className="onframe-stack">
          {dialog?.error && (
            <Alert appearance="soft" tone="danger">
              {dialog.error}
            </Alert>
          )}
          <p>
            O produto <strong>{dialog?.product?.name}</strong> e seu histórico de custos serão removidos
            permanentemente. Esta ação não pode ser desfeita.
          </p>
        </div>
      </Modal>
    </div>
  );
}
