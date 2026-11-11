import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Avatar, Button, ButtonGroup, Card, Divider, NumberField, Ph, Spinner, Tooltip } from '@onblide/ui';
import { trustedLogo } from '../shared/IntegrationAccount';
import { SectionHeader } from '../shared/SectionHeader';
import { sendRemoteMessage, userError } from '../shared/runtime';

function accountName(account) {
  return account.displayName || account.nickname || `Conta ${account.userId}`;
}

function configurationSignature(values) {
  return JSON.stringify(values);
}

export function TaxSettings({ accounts = [] }) {
  const [configuration, setConfiguration] = useState(null);
  const [values, setValues] = useState({ workspaceTaxRate: null, accounts: [] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [baseline, setBaseline] = useState('');
  const [error, setError] = useState('');
  const [minimumMargin, setMinimumMargin] = useState(null);
  const [minimumBaseline, setMinimumBaseline] = useState(null);
  const [editingAccountId, setEditingAccountId] = useState(null);
  const editingAccountControl = useRef(null);

  useEffect(() => {
    if (editingAccountId !== null) editingAccountControl.current?.querySelector('input')?.focus();
  }, [editingAccountId]);

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

  const taxDirty = configurationSignature(values) !== baseline;
  const minimumDirty = minimumMargin !== minimumBaseline;
  const dirty = taxDirty || minimumDirty;

  async function save() {
    if (!dirty) {
      setEditingAccountId(null);
      return;
    }
    setSaving(true);
    setError('');
    const requests = [];
    if (taxDirty) requests.push(['tax', sendRemoteMessage('tax-configuration-update', { payload: values })]);
    if (minimumDirty)
      requests.push([
        'margin',
        sendRemoteMessage('margin-configuration-update', { payload: { minimumContributionMargin: minimumMargin } })
      ]);
    const results = await Promise.allSettled(requests.map(([, request]) => request));
    const failures = [];
    results.forEach((outcome, index) => {
      const [kind] = requests[index];
      if (outcome.status === 'rejected') {
        failures.push(
          userError(
            outcome.reason,
            kind === 'tax' ? 'Não foi possível salvar as alíquotas.' : 'Não foi possível salvar a margem mínima.'
          )
        );
        return;
      }
      if (kind === 'tax') {
        const result = outcome.value;
        setConfiguration(result);
        const nextValues = {
          workspaceTaxRate: result.workspaceTaxRate,
          accounts: (result.accounts || []).map((account) => ({
            sellerAccountId: account.id,
            taxRate: account.taxRate
          }))
        };
        setValues(nextValues);
        setBaseline(configurationSignature(nextValues));
      } else {
        setMinimumMargin(outcome.value.workspaceMinimumContributionMargin);
        setMinimumBaseline(outcome.value.workspaceMinimumContributionMargin);
      }
    });
    setError(failures.join(' '));
    setSaved(failures.length === 0);
    setEditingAccountId(null);
    setSaving(false);
  }

  function discard() {
    setValues(JSON.parse(baseline));
    setMinimumMargin(minimumBaseline);
    setEditingAccountId(null);
    setSaved(false);
    setError('');
  }

  const configuredAccountCount = values.accounts.filter((account) => account.taxRate != null).length;

  if (loading)
    return (
      <div className="onframe-tax-settings-loading" role="status">
        <Spinner size="sm" label="Carregando configurações de imposto" />
      </div>
    );

  if (!configuration)
    return (
      <Alert appearance="soft" tone="danger">
        {error || 'Não foi possível carregar as configurações de margem de contribuição.'}
      </Alert>
    );

  return (
    <div className="onframe-tax-settings onframe-settings-form onframe-stack">
      {error && (
        <Alert appearance="soft" tone="danger" dismissible onClose={() => setError('')}>
          {error}
        </Alert>
      )}
      <SectionHeader
        title="Margem mínima"
        copy="Referência para identificar promoções abaixo da margem de contribuição desejada. Cada produto pode ter seu próprio limite."
      />
      <section className="onframe-tax-settings-section">
        <div className="onframe-tax-settings-copy">
          <h3>Padrão do workspace</h3>
          <p>Vale para os produtos sem uma margem mínima própria.</p>
        </div>
        <NumberField
          label="Margem de contribuição mínima"
          hint="Sem valor, não há comparação para os produtos que herdam o padrão."
          value={minimumMargin}
          min={0}
          max={100}
          decimals={2}
          step={0.01}
          controls="none"
          endAddon="%"
          width={240}
          disabled={saving}
          onChange={(value) => {
            setMinimumMargin(value);
            setSaved(false);
            setError('');
          }}
        />
      </section>
      <SectionHeader
        title="Alíquota de imposto"
        copy="Entra no cálculo da margem de contribuição. Cada produto usa a alíquota mais específica que tiver."
      />
      <section className="onframe-tax-settings-section">
        <div className="onframe-tax-settings-copy">
          <h3>Padrão do workspace</h3>
          <p>Vale quando nem a conta nem o produto têm alíquota própria.</p>
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
        <div className="onframe-tax-account-heading onframe-tax-settings-copy">
          <h3>Por conta</h3>
          <p>
            {configuredAccountCount === 0
              ? 'Nenhuma com alíquota própria'
              : `${configuredAccountCount} ${configuredAccountCount === 1 ? 'com alíquota própria' : 'com alíquotas próprias'}`}
          </p>
        </div>
        {configuration?.accounts?.length === 0 && (
          <p className="onframe-empty">Conecte uma conta do Mercado Livre para configurar uma exceção.</p>
        )}
        {configuration?.accounts?.length > 0 && (
          <div className="onframe-tax-account-list">
            {configuration.accounts.map((account) => {
              const value = values.accounts.find((entry) => entry.sellerAccountId === account.id)?.taxRate ?? null;
              const hasOwnRate = value !== null;
              const isEditing = editingAccountId === account.id;
              return (
                <Card key={account.id}>
                  <div className="onframe-tax-account-row">
                    <div className="onframe-tax-account-identity">
                      <Avatar
                        name={accountName(account)}
                        src={trustedLogo(accounts.find((entry) => entry.id === account.id)?.logo)}
                        size={36}
                        alt=""
                      />
                      <div className="onframe-tax-account-description">
                        <strong>{accountName(account)}</strong>
                        <span className="onframe-tax-account-id">ID {account.userId}</span>
                      </div>
                    </div>
                    <div
                      className="onframe-tax-account-controls"
                      ref={isEditing && !hasOwnRate ? editingAccountControl : null}
                    >
                      {hasOwnRate || isEditing ? (
                        <>
                          <div className="onframe-tax-account-field">
                            <NumberField
                              ariaLabel={`Alíquota de ${accountName(account)}`}
                              value={value}
                              placeholder="0,00"
                              min={0}
                              max={100}
                              decimals={2}
                              step={0.01}
                              controls="none"
                              endAddon="%"
                              disabled={saving}
                              onChange={(taxRate) => {
                                if (taxRate === null) setEditingAccountId(account.id);
                                setAccountRate(account.id, taxRate);
                              }}
                            />
                          </div>
                          <Tooltip label={hasOwnRate ? 'Usar alíquota padrão' : 'Cancelar'}>
                            <Button
                              kind="quiet"
                              iconOnly
                              aria-label={hasOwnRate ? `Usar alíquota padrão em ${accountName(account)}` : 'Cancelar'}
                              disabled={saving}
                              icon={<Ph n={hasOwnRate ? 'arrow-counter-clockwise' : 'x'} size={16} />}
                              onClick={() => {
                                setAccountRate(account.id, null);
                                setEditingAccountId(null);
                              }}
                            />
                          </Tooltip>
                        </>
                      ) : (
                        <Button
                          kind="secondary"
                          disabled={saving}
                          icon={<Ph n="plus" size={15} />}
                          onClick={() => setEditingAccountId(account.id)}
                        >
                          Definir própria
                        </Button>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </section>
      <footer className="onframe-settings-action-bar" aria-label="Ações da margem de contribuição">
        <div className="onframe-settings-action-bar-content">
          <Divider decorative />
          <div className="onframe-settings-action-bar-controls">
            {dirty && (
              <p className="onframe-settings-action-status" role="status">
                Alterações não salvas
              </p>
            )}
            <div className="onframe-settings-action-buttons">
              <ButtonGroup attached={false} justify="end" ariaLabel="Ações da margem de contribuição">
                {(dirty || editingAccountId !== null) && (
                  <Button kind="ghost" disabled={saving} onClick={discard}>
                    Descartar
                  </Button>
                )}
                <Button
                  disabled={saving || (!dirty && editingAccountId === null)}
                  icon={
                    saving ? <Spinner size="xs" label="Salvando" /> : saved ? <Ph n="check-circle" size={17} /> : null
                  }
                  onClick={() => void save()}
                >
                  {saving ? 'Salvando...' : saved ? 'Salvo' : 'Salvar alterações'}
                </Button>
              </ButtonGroup>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
