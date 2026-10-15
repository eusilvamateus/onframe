import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Button, Card, Chip, Datepicker, formatarPeriodo, Pagination, Ph, Popover, SearchInput, Select, Skeleton, Tooltip } from '@onblide/ui';
import { ItemEditEventCard } from '../shared/ItemEditEvent';
import { SectionHeader } from '../shared/SectionHeader';
import { accountName } from '../shared/IntegrationAccount';
import { sendRemoteMessage, userError } from '../shared/runtime';

const PAGE_SIZE = 10;
const EMPTY_PERIOD = { preset: 'all', start: '', end: '' };
const TYPE_OPTIONS = [
  { label: 'Todos os tipos', id: '' },
  { label: 'Preço', id: 'price' },
  { label: 'Descrição', id: 'description' },
  { label: 'Ficha técnica', id: 'characteristics' },
  { label: 'Promoção', id: 'promotion' },
  { label: 'Fotos', id: 'pictures' }
];
const PERIOD_PRESETS = [
  { id: 'all', label: 'Sem filtro' },
  { id: '7d', label: 'Últimos 7 dias', days: 7 },
  { id: '30d', label: 'Últimos 30 dias', days: 30 },
  { id: 'today', label: 'Do dia', days: 1 },
  { id: 'month', label: 'Do mês' },
  { id: 'custom', label: 'Intervalo' }
];

function presetPeriod(preset) {
  const option = PERIOD_PRESETS.find((entry) => entry.id === preset);
  if (!option || preset === 'all') return { ...EMPTY_PERIOD };
  if (preset === 'custom') return customPeriod('', '');
  const end = new Date();
  end.setHours(0, 0, 0, 0);
  if (preset === 'today') return dayPeriod(end);
  if (preset === 'month') return monthPeriod(end, end);
  const start = new Date(end);
  start.setDate(start.getDate() - option.days + 1);
  return { preset, start: isoDate(start), end: isoDate(end) };
}

function isoDate(value) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return '';
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function dateFromIso(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(String(value || ''));
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day, 12);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
}

function timestampAt(value, endOfDay = false) {
  const date = typeof value === 'string' ? dateFromIso(value) : value;
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  const result = new Date(date);
  result.setHours(endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0);
  return result.getTime();
}

export function historyPeriodQuery(period) {
  return {
    from: timestampAt(period?.start),
    to: timestampAt(period?.end, true)
  };
}

function calendarValue(period) {
  return {
    start: dateFromIso(period.start),
    end: dateFromIso(period.end)
  };
}

function customPeriod(start, end) {
  return { preset: 'custom', start: String(start || ''), end: String(end || '') };
}

function dayPeriod(value) {
  const date = isoDate(value);
  return { preset: 'today', start: date, end: date };
}

function monthPeriod(value, today = new Date()) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return { preset: 'month', start: '', end: '' };
  const start = new Date(value.getFullYear(), value.getMonth(), 1, 12);
  const monthEnd = new Date(value.getFullYear(), value.getMonth() + 1, 0, 12);
  const currentDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12);
  const end = monthEnd > currentDay ? currentDay : monthEnd;
  return { preset: 'month', start: isoDate(start), end: isoDate(end) };
}

function isCompletePeriod(period) {
  if (period.preset === 'all') return true;
  return Boolean(period.start && period.end && period.start <= period.end);
}

function periodError(period) {
  if (Boolean(period.start) !== Boolean(period.end)) return 'Informe a data inicial e a data final.';
  if (period.start && period.end && period.start > period.end) return 'A data final deve ser igual ou posterior à inicial.';
  return '';
}

function periodCalendarRange(range) {
  return customPeriod(isoDate(range?.start), isoDate(range?.end));
}

function PeriodDatepicker({ draft, validationError, onChange }) {
  if (draft.preset === 'today') return <Datepicker
    label="Dia"
    value={dateFromIso(draft.start)}
    max={new Date()}
    stepper="day"
    calendarDisplay="popover"
    weekStartsOn={1}
    error={validationError || undefined}
    onChange={(date) => onChange(dayPeriod(date))}
  />;
  if (draft.preset === 'month') return <Datepicker
    label="Mês"
    value={dateFromIso(draft.start)}
    max={new Date()}
    stepper="month"
    calendarDisplay="popover"
    error={validationError || undefined}
    onChange={(date) => onChange(monthPeriod(date))}
  />;
  if (!['7d', '30d', 'custom'].includes(draft.preset)) return null;
  return <Datepicker
    label="Intervalo"
    mode="range"
    calendarDisplay="popover"
    value={calendarValue(draft)}
    max={new Date()}
    weekStartsOn={1}
    error={validationError || undefined}
    onChange={(range) => onChange(periodCalendarRange(range))}
  />;
}

export function historyPeriodLabel(period, hoje = new Date()) {
  return formatarPeriodo(dateFromIso(period.start), dateFromIso(period.end), { hoje }) || 'Sem filtro';
}

function selectId(options, label) {
  return options.find((option) => option.label === label)?.id || '';
}

function HistoryFilters({ accountOptions, peopleOptions, admin, accountId, userId, changeType, onApply }) {
  const [draftAccountId, setDraftAccountId] = useState(accountId);
  const [draftUserId, setDraftUserId] = useState(userId);
  const [draftChangeType, setDraftChangeType] = useState(changeType);
  const activeCount = [accountId, admin && userId, changeType].filter(Boolean).length;

  function syncDraft(open) {
    if (!open) return;
    setDraftAccountId(accountId);
    setDraftUserId(userId);
    setDraftChangeType(changeType);
  }

  return <Popover
    title="Filtrar histórico"
    width={380}
    align="end"
    onOpenChange={syncDraft}
    trigger={<Button kind="secondary" icon={<Ph n="funnel-simple" size={17} />}>Filtros{activeCount ? ` (${activeCount})` : ''}</Button>}
  >
    {(close) => <>
      <div className="onframe-history-filter-form" role="group" aria-label="Filtros do histórico" tabIndex={0}>
        <Select
          label="Conta"
          options={accountOptions}
          value={accountOptions.find((option) => option.id === draftAccountId)?.label || accountOptions[0].label}
          onChange={(label) => setDraftAccountId(selectId(accountOptions, label))}
        />
        {admin && <Select
          label="Pessoa"
          options={peopleOptions}
          value={peopleOptions.find((option) => option.id === draftUserId)?.label || peopleOptions[0].label}
          onChange={(label) => setDraftUserId(selectId(peopleOptions, label))}
        />}
        <Select
          label="Tipo de alteração"
          options={TYPE_OPTIONS}
          value={TYPE_OPTIONS.find((option) => option.id === draftChangeType)?.label || TYPE_OPTIONS[0].label}
          onChange={(label) => setDraftChangeType(selectId(TYPE_OPTIONS, label))}
        />
      </div>
      <div className="onframe-history-popover-actions">
        <Button kind="quiet" onClick={() => {
          setDraftAccountId('');
          setDraftUserId('');
          setDraftChangeType('');
        }}>Limpar</Button>
        <Button onClick={() => {
          onApply({ accountId: draftAccountId, userId: admin ? draftUserId : '', changeType: draftChangeType });
          close();
        }}>Aplicar filtros</Button>
      </div>
    </>}
  </Popover>;
}

function PeriodFilter({ period, onApply }) {
  const [draft, setDraft] = useState(period);
  const complete = isCompletePeriod(draft);
  const validationError = periodError(draft);

  return <Tooltip label="Período">
    <Popover
      title="Período"
      width={420}
      align="end"
      onOpenChange={(open) => { if (open) setDraft(period); }}
      trigger={<Chip icon="calendar-blank" label={historyPeriodLabel(period)} selected={Boolean(period.start && period.end)} />}
    >
      {(close) => <>
        <div className="onframe-history-period-layout">
          <div className="onframe-history-period-presets" aria-label="Períodos rápidos">
            {PERIOD_PRESETS.map((preset) => <Chip
              key={preset.id}
              label={preset.label}
              size="sm"
              selected={draft.preset === preset.id}
              onToggle={() => setDraft(presetPeriod(preset.id))}
            />)}
          </div>
          {draft.preset !== 'all' && <div className="onframe-history-period-picker">
            <PeriodDatepicker draft={draft} validationError={validationError} onChange={setDraft} />
          </div>}
        </div>
        <div className="onframe-history-popover-actions">
          <Button kind="quiet" onClick={() => setDraft({ ...EMPTY_PERIOD })}>Limpar</Button>
          <Button disabled={!complete} onClick={() => {
            onApply(draft);
            close();
          }}>Aplicar período</Button>
        </div>
      </>}
    </Popover>
  </Tooltip>;
}

function LoadingHistory() {
  return <div className="onframe-history-list" aria-label="Carregando histórico">
    {[0, 1, 2].map((item) => <Card padding={16} key={item}><div className="onframe-history-loading-row"><Skeleton width={48} height={48} radius={6} /><div><Skeleton width={280} height={14} /><Skeleton width={180} height={11} /><Skeleton width={360} height={11} /></div></div></Card>)}
  </div>;
}

export function ItemEditHistory({ accounts, members, currentUser, admin, onOpenActor }) {
  const [events, setEvents] = useState([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [itemId, setItemId] = useState('');
  const [accountId, setAccountId] = useState('');
  const [userId, setUserId] = useState('');
  const [changeType, setChangeType] = useState('');
  const [period, setPeriod] = useState(EMPTY_PERIOD);
  const requestVersion = useRef(0);

  const accountOptions = [{ label: 'Todas as contas', id: '' }].concat(accounts.map((account) => ({
    label: accountName(account),
    id: account.id
  })));
  const visiblePeople = admin ? members : currentUser ? [currentUser] : [];
  const peopleOptions = [{ label: 'Todas as pessoas', id: '' }].concat(visiblePeople.map((person) => ({
    label: person.name || person.email,
    id: person.id
  })));

  useEffect(() => {
    const timer = setTimeout(() => {
      setItemId(String(search || '').trim().toUpperCase());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const load = useCallback(async () => {
    const version = ++requestVersion.current;
    setLoading(true);
    setError('');
    try {
      const result = await sendRemoteMessage('item-edit-history', {
        query: {
          limit: PAGE_SIZE,
          page,
          itemId,
          accountId,
          userId,
          changeType,
          ...historyPeriodQuery(period)
        }
      });
      if (version !== requestVersion.current) return;
      setEvents(result.events || []);
      setTotal(Number(result.total) || 0);
      setTotalPages(Math.max(1, Number(result.totalPages) || 1));
    } catch (loadError) {
      if (version === requestVersion.current) setError(userError(loadError, 'Não foi possível carregar o histórico.'));
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }, [accountId, changeType, itemId, page, period, userId]);

  useEffect(() => { void load(); }, [load]);

  const hasFilters = Boolean(search || accountId || userId || changeType || period.start || period.end);
  function clearFilters() {
    setSearch('');
    setItemId('');
    setAccountId('');
    setUserId('');
    setChangeType('');
    setPeriod(EMPTY_PERIOD);
    setPage(1);
  }

  return <div className="onframe-stack">
    <SectionHeader eyebrow="ANÚNCIOS" title="Alterações confirmadas" copy="Consulte o que foi alterado pela extensão, quando e por quem." />
    <div className="onframe-history-toolbar" aria-label="Controles do histórico">
      <SearchInput value={search} onChange={setSearch} loading={loading && String(search || '').trim().toUpperCase() !== itemId} placeholder="Buscar por ID do anúncio" ariaLabel="Buscar por ID do anúncio" width="100%" />
      <div className="onframe-history-toolbar-actions">
        <PeriodFilter period={period} onApply={(nextPeriod) => { setPeriod(nextPeriod); setPage(1); }} />
        <HistoryFilters
          accountOptions={accountOptions}
          peopleOptions={peopleOptions}
          admin={admin}
          accountId={accountId}
          userId={userId}
          changeType={changeType}
          onApply={(filters) => {
            setAccountId(filters.accountId);
            setUserId(filters.userId);
            setChangeType(filters.changeType);
            setPage(1);
          }}
        />
        {hasFilters && <Button kind="quiet" tone="neutral" iconOnly aria-label="Limpar filtros" onClick={clearFilters} icon={<Ph n="x-circle" size={17} />} />}
      </div>
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
      <div className="onframe-history-pagination">
        <span>{total === 1 ? '1 alteração' : `${total} alterações`}</span>
        <Pagination page={page} total={totalPages} onChange={setPage} />
      </div>
    </> : null}
  </div>;
}
