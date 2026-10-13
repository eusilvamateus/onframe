import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Button, Card, Ph, SearchInput, Select, Skeleton } from '@onblide/ui';
import { ItemEditEventCard } from '../shared/ItemEditEvent';
import { SectionHeader } from '../shared/SectionHeader';
import { accountName } from '../shared/IntegrationAccount';
import { sendRemoteMessage, userError } from '../shared/runtime';

const TYPE_OPTIONS = [
  { label: 'Todos os tipos', id: '' },
  { label: 'Preço', id: 'price' },
  { label: 'Descrição', id: 'description' },
  { label: 'Ficha técnica', id: 'characteristics' },
  { label: 'Promoção', id: 'promotion' },
  { label: 'Fotos', id: 'pictures' }
];

function selectId(options, label) {
  return options.find((option) => option.label === label)?.id || '';
}

function LoadingHistory() {
  return <div className="onframe-history-list" aria-label="Carregando histórico">
    {[0, 1, 2].map((item) => <Card padding={16} key={item}><div className="onframe-history-loading-row"><Skeleton width={48} height={48} radius={6} /><div><Skeleton width={280} height={14} /><Skeleton width={180} height={11} /><Skeleton width={360} height={11} /></div></div></Card>)}
  </div>;
}

export function ItemEditHistory({ accounts, members, currentUser, admin, onOpenActor }) {
  const [events, setEvents] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [itemId, setItemId] = useState('');
  const [accountId, setAccountId] = useState('');
  const [userId, setUserId] = useState('');
  const [changeType, setChangeType] = useState('');
  const requestVersion = useRef(0);

  const accountOptions = [{ label: 'Todas as contas', id: '' }].concat(accounts.map((account) => ({
    label: `${accountName(account)} · ${account.user_id}`,
    id: account.id
  })));
  const visiblePeople = admin ? members : currentUser ? [currentUser] : [];
  const peopleOptions = [{ label: 'Todas as pessoas', id: '' }].concat(visiblePeople.map((person) => ({
    label: `${person.name || person.email} · ${person.email}`,
    id: person.id
  })));

  useEffect(() => {
    const timer = setTimeout(() => setItemId(String(search || '').trim().toUpperCase()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const load = useCallback(async (cursor = null, append = false) => {
    const version = ++requestVersion.current;
    if (append) setLoadingMore(true);
    else setLoading(true);
    setError('');
    try {
      const result = await sendRemoteMessage('item-edit-history', {
        query: { limit: 20, cursor, itemId, accountId, userId, changeType }
      });
      if (version !== requestVersion.current) return;
      setEvents((current) => append ? current.concat(result.events || []) : result.events || []);
      setNextCursor(result.nextCursor || null);
    } catch (loadError) {
      if (version === requestVersion.current) setError(userError(loadError, 'Não foi possível carregar o histórico.'));
    } finally {
      if (version === requestVersion.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [accountId, changeType, itemId, userId]);

  useEffect(() => { void load(); }, [load]);

  const hasFilters = Boolean(search || accountId || userId || changeType);
  function clearFilters() {
    setSearch('');
    setItemId('');
    setAccountId('');
    setUserId('');
    setChangeType('');
  }

  return <div className="onframe-stack">
    <SectionHeader eyebrow="ANÚNCIOS" title="Alterações confirmadas" copy="Consulte o que foi alterado pela extensão, quando e por quem." />
    <div className="onframe-history-filters" aria-label="Filtros do histórico">
      <SearchInput value={search} onChange={setSearch} loading={loading && search !== itemId} placeholder="Buscar por ID do anúncio" ariaLabel="Buscar por ID do anúncio" width="100%" />
      <Select options={accountOptions} value={accountOptions.find((option) => option.id === accountId)?.label || accountOptions[0].label} onChange={(label) => setAccountId(selectId(accountOptions, label))} label="Conta" />
      {admin && <Select options={peopleOptions} value={peopleOptions.find((option) => option.id === userId)?.label || peopleOptions[0].label} onChange={(label) => setUserId(selectId(peopleOptions, label))} label="Pessoa" />}
      <Select options={TYPE_OPTIONS} value={TYPE_OPTIONS.find((option) => option.id === changeType)?.label || TYPE_OPTIONS[0].label} onChange={(label) => setChangeType(selectId(TYPE_OPTIONS, label))} label="Tipo de alteração" />
      {hasFilters && <Button kind="quiet" tone="neutral" onClick={clearFilters} icon={<Ph n="x-circle" size={17} />}>Limpar filtros</Button>}
    </div>
    {error && <Alert tone="danger" action="Tentar novamente" onAction={() => void load()}>{error}</Alert>}
    {loading ? <LoadingHistory /> : events.length === 0 && !error ? <Card padding={24}>
      <div className="onframe-history-empty">
        <span className="onframe-popup-icon-tile onframe-popup-icon-tile--green"><Ph n="clock-counter-clockwise" size={18} /></span>
        <div><h3>{hasFilters ? 'Nenhum resultado encontrado' : 'Nenhuma alteração registrada'}</h3><p>{hasFilters ? 'Revise os filtros aplicados.' : 'As próximas edições confirmadas pelo Mercado Livre aparecerão aqui.'}</p></div>
      </div>
    </Card> : events.length > 0 ? <>
      <div className="onframe-history-list">
        {events.map((event) => <ItemEditEventCard key={event.id} event={event} onOpenActor={onOpenActor} />)}
      </div>
      {nextCursor && <div className="onframe-history-load-more"><Button kind="secondary" disabled={loadingMore} onClick={() => void load(nextCursor, true)} icon={loadingMore ? <Ph n="circle-notch" size={17} /> : <Ph n="caret-down" size={17} />}>{loadingMore ? 'Carregando' : 'Carregar mais'}</Button></div>}
    </> : null}
  </div>;
}
