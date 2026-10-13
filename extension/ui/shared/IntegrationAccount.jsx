import { useRef, useState } from 'react';
import { Avatar, Button, Card, Input, Ph, Switch, Tooltip } from '@onblide/ui';
import { openExternal } from './runtime';

export function accountName(account) {
  return account.display_name || account.nickname || `Conta ${account.user_id || ''}`.trim();
}

function accountStoreUrl(account) {
  try {
    const url = new URL(account.permalink);
    const trustedHost = url.hostname === 'mercadolivre.com.br' || url.hostname.endsWith('.mercadolivre.com.br');
    if (!trustedHost || (url.protocol !== 'http:' && url.protocol !== 'https:')) return '';
    url.protocol = 'https:';
    return url.href;
  } catch {
    return '';
  }
}

export function trustedLogo(value) {
  const logo = String(value || '').trim();
  return /^https:\/\/(?:[a-z0-9-]+\.)*mlstatic\.com\//iu.test(logo) ? logo : '';
}

export function IntegrationAccount({ account, admin, mode, loading, onUpdate, onRename, onRemove, compact = false }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(accountName(account));
  const savingName = useRef(false);
  const storeUrl = accountStoreUrl(account);
  const label = accountName(account);
  const id = `ID ${account.user_id}`;

  function cancelEdit() {
    setName(label);
    setEditing(false);
  }

  async function saveName() {
    const value = name.trim();
    if (!value || value === label) {
      cancelEdit();
      return;
    }
    savingName.current = true;
    try {
      if (await onRename(account, value)) setEditing(false);
    } finally {
      savingName.current = false;
    }
  }

  const controls = (
    <div className={`onframe-integration-controls${compact ? ' onframe-integration-controls--compact' : ''}`}>
      {storeUrl && <Tooltip label="Abrir página da loja">
        <Button kind="quiet" tone="primary" size="sm" iconOnly aria-label={`Abrir página da loja de ${label}`} icon={<Ph n="arrow-square-out" size={18} />} onClick={() => openExternal(storeUrl)} />
      </Tooltip>}
      {admin && <>
        <Tooltip label={account.enabled === false ? 'Ativar conta' : 'Desativar conta'}>
          <span role="group" aria-label={`Status de ${label}`}><Switch size="md" checked={account.enabled !== false} disabled={loading} onChange={(enabled) => onUpdate(account, enabled)} /></span>
        </Tooltip>
        <Tooltip label="Remover conta">
          <Button kind="quiet" tone="danger" size="sm" iconOnly aria-label={`Remover ${label}`} disabled={loading} icon={<Ph n="trash" size={18} />} onClick={() => onRemove(account)} />
        </Tooltip>
      </>}
    </div>
  );

  const identity = (
    <div className="onframe-integration-identity">
      <Avatar name={label} src={trustedLogo(account.logo)} alt="" size={mode === 'cards' ? 44 : 36} />
      <div className="onframe-grow">
        {editing ? <div className="onframe-integration-edit" onBlur={(event) => {
          if (!savingName.current && !event.currentTarget.contains(event.relatedTarget)) cancelEdit();
        }}>
          <Input aria-label="Nome da conta" value={name} maxLength={80} onChange={(event) => setName(event.target.value)} onFocus={(event) => event.target.select()} onKeyDown={(event) => {
            if (event.key === 'Enter') { event.preventDefault(); void saveName(); }
            if (event.key === 'Escape') cancelEdit();
          }} autoFocus disabled={loading} />
          <Tooltip label="Salvar nome"><Button kind="quiet" tone="success" size="sm" iconOnly aria-label="Salvar nome" disabled={loading || !name.trim()} icon={<Ph n="check" size={16} />} onClick={() => void saveName()} /></Tooltip>
          <Tooltip label="Cancelar edição"><Button kind="quiet" tone="neutral" size="sm" iconOnly aria-label="Cancelar edição" disabled={loading} icon={<Ph n="x" size={16} />} onClick={cancelEdit} /></Tooltip>
        </div> : <div className="onframe-integration-name">
          <p className="onframe-card-title">{label}</p>
          {admin && <Tooltip label="Renomear conta"><Button kind="quiet" tone="primary" size="sm" iconOnly aria-label={`Renomear ${label}`} disabled={loading} icon={<Ph n="pencil-simple" size={16} />} onClick={() => { setName(label); setEditing(true); }} /></Tooltip>}
        </div>}
        <p className="onframe-list-meta">{id}</p>
      </div>
    </div>
  );

  if (mode === 'cards') return <Card padding={compact ? 12 : 20}><div className={`onframe-integration-card${compact ? ' onframe-popup-integration-account' : ''}`}>{identity}{controls}</div></Card>;
  return <div className={`${compact ? 'onframe-popup-integration-list-item' : 'onframe-integration-list-item'}`}>{identity}{controls}</div>;
}
