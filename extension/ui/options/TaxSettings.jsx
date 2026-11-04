import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Button, NumberField, Ph, Spinner, toast } from '@onblide/ui';
import { SectionHeader } from '../shared/SectionHeader';
import { sendRemoteMessage, userError } from '../shared/runtime';

function accountName(account) {
  return account.displayName || account.nickname || `Conta ${account.userId}`;
}

export function TaxSettings({ workspaceId }) {
  const [configuration, setConfiguration] = useState(null);
  const [values, setValues] = useState({ workspaceTaxRate: null, accounts: [] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await sendRemoteMessage('tax-configuration');
      setConfiguration(result);
      setValues({
        workspaceTaxRate: result.workspaceTaxRate,
        accounts: (result.accounts || []).map((account) => ({ sellerAccountId: account.id, taxRate: account.taxRate }))
      });
    } catch (failure) {
      setError(userError(failure, 'Não foi possível carregar as configurações de imposto.'));
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => { void load(); }, [load]);

  const setAccountRate = (sellerAccountId, taxRate) => {
    setValues((state) => ({
      ...state,
      accounts: state.accounts.map((account) => account.sellerAccountId === sellerAccountId ? { ...account, taxRate } : account)
    }));
  };

  async function save() {
    setSaving(true);
    setError('');
    try {
      const result = await sendRemoteMessage('tax-configuration-update', { payload: values });
      setConfiguration(result);
      setValues({
        workspaceTaxRate: result.workspaceTaxRate,
        accounts: (result.accounts || []).map((account) => ({ sellerAccountId: account.id, taxRate: account.taxRate }))
      });
      toast({ tone: 'success', title: 'Configurações de imposto salvas.' });
    } catch (failure) {
      setError(userError(failure, 'Não foi possível salvar as configurações de imposto.'));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="onframe-tax-settings-loading" role="status"><Spinner size="sm" label="Carregando configurações de imposto" /></div>;

  return <div className="onframe-tax-settings onframe-stack">
    {error && <Alert tone="danger" dismissible onClose={() => setError('')}>{error}</Alert>}
    <SectionHeader
      eyebrow="MARGEM DE CONTRIBUIÇÃO"
      title="Impostos sobre venda"
      copy="Defina as alíquotas usadas no cálculo das promoções. A base de cálculo é sempre o preço efetivo da venda."
    />
    <section className="onframe-tax-settings-section">
      <div className="onframe-tax-settings-copy">
        <h3>Padrão do workspace</h3>
        <p>Aplicado quando não existe uma configuração mais específica para a conta ou para o produto.</p>
      </div>
      <NumberField
        label="Alíquota padrão"
        hint="Deixe vazio quando o workspace não tiver um padrão."
        value={values.workspaceTaxRate}
        min={0}
        max={100}
        decimals={2}
        step={0.01}
        controls="none"
        endAddon="%"
        width={240}
        disabled={saving}
        onChange={(workspaceTaxRate) => setValues((state) => ({ ...state, workspaceTaxRate }))}
      />
    </section>
    <section className="onframe-tax-settings-section onframe-tax-settings-section--accounts">
      <div className="onframe-tax-settings-copy">
        <h3>Exceções por conta</h3>
        <p>Uma alíquota definida aqui substitui o padrão do workspace para essa conta.</p>
      </div>
      {configuration?.accounts?.length === 0 && <p className="onframe-empty">Conecte uma conta do Mercado Livre para configurar uma exceção.</p>}
      {configuration?.accounts?.length > 0 && <div className="onframe-tax-account-list">
        {configuration.accounts.map((account) => {
          const value = values.accounts.find((entry) => entry.sellerAccountId === account.id)?.taxRate ?? null;
          return <div className="onframe-tax-account-row" key={account.id}>
            <div>
              <strong>{accountName(account)}</strong>
              <span>ID {account.userId}</span>
            </div>
            <NumberField
              ariaLabel={`Alíquota de ${accountName(account)}`}
              value={value}
              placeholder={values.workspaceTaxRate === null ? 'Sem padrão' : `${values.workspaceTaxRate}%`}
              min={0}
              max={100}
              decimals={2}
              step={0.01}
              controls="none"
              endAddon="%"
              width={180}
              disabled={saving}
              onChange={(taxRate) => setAccountRate(account.id, taxRate)}
            />
          </div>;
        })}
      </div>}
    </section>
    <div className="onframe-tax-settings-actions">
      <Button disabled={saving} icon={saving ? <Spinner size="xs" label="Salvando" /> : <Ph n="floppy-disk" size={17} />} onClick={() => void save()}>
        {saving ? 'Salvando...' : 'Salvar configurações'}
      </Button>
    </div>
  </div>;
}
