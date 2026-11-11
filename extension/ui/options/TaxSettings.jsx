import { useCallback, useEffect, useState } from 'react';
import { Alert, Button, NumberField, Ph, Spinner } from '@onblide/ui';
import { SectionHeader } from '../shared/SectionHeader';
import { sendRemoteMessage, userError } from '../shared/runtime';

function accountName(account) {
  return account.displayName || account.nickname || `Conta ${account.userId}`;
}

function configurationSignature(values) {
  return JSON.stringify(values);
}

export function TaxSettings() {
  const [configuration, setConfiguration] = useState(null);
  const [values, setValues] = useState({ workspaceTaxRate: null, accounts: [] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [baseline, setBaseline] = useState('');
  const [error, setError] = useState('');
  const [minimumMargin, setMinimumMargin] = useState(null);
  const [minimumBaseline, setMinimumBaseline] = useState(null);
  const [minimumSaving, setMinimumSaving] = useState(false);
  const [minimumSaved, setMinimumSaved] = useState(false);
  const [minimumError, setMinimumError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [result, marginResult] = await Promise.all([
        sendRemoteMessage('tax-configuration'),
        sendRemoteMessage('margin-configuration')
      ]);
      setConfiguration(result);
      const nextValues = {
        workspaceTaxRate: result.workspaceTaxRate,
        accounts: (result.accounts || []).map((account) => ({ sellerAccountId: account.id, taxRate: account.taxRate }))
      };
      setValues(nextValues);
      setBaseline(configurationSignature(nextValues));
      setMinimumMargin(marginResult.workspaceMinimumContributionMargin);
      setMinimumBaseline(marginResult.workspaceMinimumContributionMargin);
      setSaved(false);
    } catch (failure) {
      setError(userError(failure, 'Não foi possível carregar as configurações de imposto.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const setAccountRate = (sellerAccountId, taxRate) => {
    setSaved(false);
    setError('');
    setValues((state) => ({
      ...state,
      accounts: state.accounts.map((account) =>
        account.sellerAccountId === sellerAccountId ? { ...account, taxRate } : account
      )
    }));
  };

  const dirty = configurationSignature(values) !== baseline;
  const minimumDirty = minimumMargin !== minimumBaseline;

  async function save() {
    setSaving(true);
    setError('');
    try {
      const result = await sendRemoteMessage('tax-configuration-update', { payload: values });
      setConfiguration(result);
      const nextValues = {
        workspaceTaxRate: result.workspaceTaxRate,
        accounts: (result.accounts || []).map((account) => ({ sellerAccountId: account.id, taxRate: account.taxRate }))
      };
      setValues(nextValues);
      setBaseline(configurationSignature(nextValues));
      setSaved(true);
    } catch (failure) {
      setError(userError(failure, 'Não foi possível salvar as configurações de imposto.'));
    } finally {
      setSaving(false);
    }
  }

  async function saveMinimumMargin() {
    setMinimumSaving(true);
    setMinimumError('');
    try {
      const result = await sendRemoteMessage('margin-configuration-update', {
        payload: { minimumContributionMargin: minimumMargin }
      });
      setMinimumMargin(result.workspaceMinimumContributionMargin);
      setMinimumBaseline(result.workspaceMinimumContributionMargin);
      setMinimumSaved(true);
    } catch (failure) {
      setMinimumError(userError(failure, 'Não foi possível salvar a MC mínima.'));
    } finally {
      setMinimumSaving(false);
    }
  }

  if (loading)
    return (
      <div className="onframe-tax-settings-loading" role="status">
        <Spinner size="sm" label="Carregando configurações de imposto" />
      </div>
    );

  return (
    <div className="onframe-tax-settings onframe-stack">
      {error && (
        <Alert appearance="soft" tone="danger" dismissible onClose={() => setError('')}>
          {error}
        </Alert>
      )}
      <SectionHeader
        eyebrow="Margem de contribuição"
        title="Parâmetros de margem"
        copy="Configure limites e alíquotas usados na leitura de margem das promoções."
      />
      <section className="onframe-tax-settings-section">
        <div className="onframe-tax-settings-copy">
          <h3>MC mínima padrão do workspace</h3>
          <p>Produtos podem ter um limite próprio. Sem exceção, usam este valor.</p>
        </div>
        <NumberField
          label="MC mínima padrão"
          hint="Deixe vazio para desativar a comparação automática."
          value={minimumMargin}
          min={0}
          max={100}
          decimals={2}
          step={0.01}
          controls="none"
          endAddon="%"
          width={240}
          disabled={minimumSaving}
          onChange={(value) => {
            setMinimumMargin(value);
            setMinimumSaved(false);
            setMinimumError('');
          }}
        />
        <div className="onframe-tax-settings-actions">
          <Button
            disabled={minimumSaving || !minimumDirty}
            icon={
              minimumSaving ? (
                <Spinner size="xs" label="Salvando" />
              ) : minimumSaved ? (
                <Ph n="check-circle" size={17} />
              ) : (
                <Ph n="floppy-disk" size={17} />
              )
            }
            onClick={() => void saveMinimumMargin()}
          >
            {minimumSaving ? 'Salvando...' : minimumSaved ? 'Salvo' : 'Salvar MC mínima'}
          </Button>
        </div>
        {minimumError && (
          <Alert appearance="soft" tone="danger">
            {minimumError}
          </Alert>
        )}
      </section>
      <section className="onframe-tax-settings-section">
        <div className="onframe-tax-settings-copy">
          <h3>Alíquota padrão do workspace</h3>
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
          onChange={(workspaceTaxRate) => {
            setSaved(false);
            setError('');
            setValues((state) => ({ ...state, workspaceTaxRate }));
          }}
        />
      </section>
      <section className="onframe-tax-settings-section onframe-tax-settings-section--accounts">
        <div className="onframe-tax-settings-copy">
          <h3>Exceções por conta</h3>
          <p>Uma alíquota definida aqui substitui o padrão do workspace para essa conta.</p>
        </div>
        {configuration?.accounts?.length === 0 && (
          <p className="onframe-empty">Conecte uma conta do Mercado Livre para configurar uma exceção.</p>
        )}
        {configuration?.accounts?.length > 0 && (
          <div className="onframe-tax-account-list">
            {configuration.accounts.map((account) => {
              const value = values.accounts.find((entry) => entry.sellerAccountId === account.id)?.taxRate ?? null;
              return (
                <div className="onframe-tax-account-row" key={account.id}>
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
                </div>
              );
            })}
          </div>
        )}
      </section>
      <div className="onframe-tax-settings-actions">
        <Button
          disabled={saving || !dirty}
          icon={
            saving ? (
              <Spinner size="xs" label="Salvando" />
            ) : saved ? (
              <Ph n="check-circle" size={17} />
            ) : (
              <Ph n="floppy-disk" size={17} />
            )
          }
          onClick={() => void save()}
        >
          {saving ? 'Salvando...' : saved ? 'Salvo' : 'Salvar configurações'}
        </Button>
      </div>
    </div>
  );
}
