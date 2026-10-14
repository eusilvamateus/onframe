import { useCallback, useEffect, useState } from 'react';
import { Alert, Button, ButtonGroup, Card, Modal, Ph, Skeleton, ToggleButton, Tooltip, toast } from '@onblide/ui';
import { IntegrationAccount, accountName } from '../shared/IntegrationAccount';
import { sendRemoteMessage, userError } from '../shared/runtime';
import { PopupSessionHeader } from './PopupSessionHeader';

function LoadingAccounts() {
  return <div className="onframe-popup-loading-list" aria-label="Carregando integrações">
    {[0, 1].map((item) => <div className="onframe-popup-loading-row" key={item}><Skeleton circle height={36} /><div><Skeleton width={132} height={13} /><Skeleton width={92} height={10} /></div></div>)}
  </div>;
}

export function IntegrationsSession({ connection, onBack, onOpenOptions, footer }) {
  const admin = connection.workspace.role === 'admin';
  const [accounts, setAccounts] = useState([]);
  const [mode, setMode] = useState('list');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [accountToRemove, setAccountToRemove] = useState(null);

  const loadAccounts = useCallback(async () => {
    const result = await sendRemoteMessage('accounts');
    setAccounts(result.accounts || []);
    return result.accounts || [];
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void loadAccounts()
      .catch((error) => { if (active) setFeedback({ tone: 'danger', message: userError(error) }); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [loadAccounts]);

  async function run(action, successMessage) {
    setBusy(true);
    setFeedback(null);
    try {
      const result = await action();
      if (successMessage) toast({ tone: 'success', title: successMessage });
      return result;
    } catch (error) {
      setFeedback({ tone: 'danger', message: userError(error) });
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function connectAccount() {
    await run(() => sendRemoteMessage('oauth-start'));
  }

  async function updateAccount(account, enabled) {
    await run(async () => {
      const result = await sendRemoteMessage('account-update', { userId: account.user_id, payload: { enabled } });
      setAccounts(result.accounts || []);
      return true;
    }, enabled ? 'Conta ativada.' : 'Conta desativada.');
  }

  async function renameAccount(account, displayName) {
    const result = await run(async () => {
      const response = await sendRemoteMessage('account-update', { userId: account.user_id, payload: { displayName } });
      setAccounts(response.accounts || []);
      return true;
    }, 'Nome da conta atualizado.');
    return result === true;
  }

  async function removeAccount() {
    const account = accountToRemove;
    if (!account) return;
    const result = await run(async () => {
      const response = await sendRemoteMessage('account-remove', { userId: account.user_id });
      setAccounts(response.accounts || []);
      return true;
    }, 'Conta removida do workspace.');
    if (result) setAccountToRemove(null);
  }

  const unavailable = loading || busy;

  return (
    <main className="onframe-popup onframe-popup-session">
      <PopupSessionHeader title="Integrações" subtitle={connection.workspace.name} onBack={onBack} onOpenOptions={onOpenOptions} />

      <div className="onframe-popup-session-body">
        {feedback && <Alert tone={feedback.tone} dismissible onClose={() => setFeedback(null)}>{feedback.message}</Alert>}
        <section className="onframe-popup-section" aria-labelledby="integrations-accounts-title">
          <div className="onframe-popup-section-header">
            <div>
              <h2 id="integrations-accounts-title">{admin ? 'Contas conectadas' : 'Contas atribuídas'}</h2>
              <p>{accounts.length} {accounts.length === 1 ? 'conta' : 'contas'} do Mercado Livre</p>
            </div>
            {admin && <Tooltip label="Conectar conta" placement="left"><Button kind="quiet" tone="primary" size="sm" iconOnly disabled={unavailable} aria-label="Conectar conta" onClick={() => void connectAccount()} icon={<Ph n="plus-circle" size={19} />} /></Tooltip>}
          </div>

          {!loading && accounts.length > 0 && <div className="onframe-popup-integration-view-bar">
            <ButtonGroup selection="single" value={mode} onChange={setMode} ariaLabel="Visualização das contas" size="md">
              <Tooltip label="Visualizar como lista"><ToggleButton value="list" icon="list-bullets" ariaLabel="Lista" /></Tooltip>
              <Tooltip label="Visualizar como cards"><ToggleButton value="cards" icon="squares-four" ariaLabel="Cards" /></Tooltip>
            </ButtonGroup>
          </div>}

          {loading ? <LoadingAccounts /> : accounts.length === 0 ? <Card padding={16}>
            <div className="onframe-popup-empty-state">
              <span className="onframe-popup-icon-tile onframe-popup-icon-tile--orange"><Ph n="storefront" size={18} /></span>
              <div><h3>{admin ? 'Nenhuma conta conectada' : 'Nenhuma conta atribuída'}</h3><p>{admin ? 'Conecte uma conta para disponibilizá-la neste workspace.' : 'Um administrador precisa atribuir uma conta ao seu acesso.'}</p></div>
              {admin && <Button size="sm" disabled={busy} icon={<Ph n="plus-circle" size={17} />} onClick={() => void connectAccount()}>Conectar</Button>}
            </div>
          </Card> : <div className={mode === 'cards' ? 'onframe-popup-integration-grid' : 'onframe-popup-integration-list'}>
            {accounts.map((account) => <IntegrationAccount
              key={account.id || account.user_id}
              account={account}
              admin={admin}
              mode={mode}
              compact
              loading={unavailable}
              onUpdate={(item, enabled) => void updateAccount(item, enabled)}
              onRename={renameAccount}
              onRemove={setAccountToRemove}
            />)}
          </div>}
        </section>
      </div>

      {footer}

      <Modal
        open={Boolean(accountToRemove)}
        onClose={() => setAccountToRemove(null)}
        title="Remover conta"
        role="alertdialog"
        footer={<><Button kind="secondary" disabled={busy} onClick={() => setAccountToRemove(null)}>Cancelar</Button><Button kind="danger" disabled={busy} onClick={() => void removeAccount()}>Remover</Button></>}
      >
        {accountToRemove ? `Remover ${accountName(accountToRemove)} deste workspace? Esta ação não revoga a autorização no Mercado Livre.` : ''}
      </Modal>
    </main>
  );
}
