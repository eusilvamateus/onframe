import { Avatar, Badge, Button, Card, Link, Ph, Tooltip } from '@onblide/ui';
import { formatDate, formatRelativeDate, openExternal } from './runtime';

const TYPE_META = {
  price: { label: 'Preço', icon: 'currency-circle-dollar', tone: 'green' },
  description: { label: 'Descrição', icon: 'text-align-left', tone: 'blue' },
  characteristics: { label: 'Ficha técnica', icon: 'list-checks', tone: 'orange' },
  promotion: { label: 'Promoção', icon: 'tag', tone: 'red' },
  pictures: { label: 'Fotos', icon: 'image', tone: 'blue' }
};

export function itemEditTypeMeta(type) {
  return TYPE_META[type] || { label: 'Alteração', icon: 'pencil-simple', tone: 'grey' };
}

export function itemEditTitle(event) {
  return event?.item?.title || event?.item?.id || 'Anúncio do Mercado Livre';
}

export function itemEditContext(event) {
  return [event?.account?.name, formatDate(event?.createdAt)].filter(Boolean).join(' · ');
}

function formatMoney(value, currency = 'BRL') {
  if (value === undefined || value === null || value === '') return 'Não informado';
  const money = value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  const amount = Number(money ? money.amount : value);
  if (!Number.isFinite(amount)) return 'Não informado';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: money?.currency || currency || 'BRL' }).format(amount);
}

function ProductImage({ event, meta }) {
  return <span className="onframe-history-product-media">
    <span className={`onframe-history-type-icon onframe-history-type-icon--${meta.tone}`}><Ph n={meta.icon} size={20} /></span>
    {event?.item?.thumbnailUrl && <img className="onframe-history-product-image" src={event.item.thumbnailUrl} alt="" onError={(image) => { image.currentTarget.style.display = 'none'; }} />}
  </span>;
}

function HistoryDetails({ event }) {
  const details = event?.details || {};
  if (event.changeType === 'price') return <div className="onframe-history-price-change" aria-label="Alteração de preço">
    <span>{formatMoney(details.before, details.currency)}</span>
    <Ph n="arrow-right" size={16} />
    <strong>{formatMoney(details.after, details.currency)}</strong>
  </div>;

  if (event.changeType === 'characteristics' && Array.isArray(details.changes) && details.changes.length > 0) {
    return <dl className="onframe-history-changes">
      {details.changes.map((change) => <div key={change.id || change.label}>
        <dt>{change.label || change.id}</dt>
        <dd><span>{change.before || 'Não informado'}</span><Ph n="arrow-right" size={14} /><strong>{change.after || 'Não informado'}</strong></dd>
      </div>)}
    </dl>;
  }

  if (event.changeType === 'pictures') return <p className="onframe-history-detail-copy">
    {details.beforeCount !== null && details.beforeCount !== undefined && details.afterCount !== null && details.afterCount !== undefined && Number.isFinite(Number(details.beforeCount)) && Number.isFinite(Number(details.afterCount))
      ? `${details.beforeCount} para ${details.afterCount} fotos`
      : 'A seleção de fotos do anúncio foi atualizada.'}
  </p>;

  return null;
}

function ActorLink({ event, onOpenActor }) {
  const actorName = event?.actor?.name || event?.actor?.email || 'Pessoa não identificada';
  return <div className="onframe-history-metadata-item onframe-history-actor-context">
    <Avatar name={actorName} src={event?.actor?.avatarUrl} alt="" size={22} />
    <div><span>Responsável</span>
      {onOpenActor ? <Link href="#configuracoes-workspace-people" variant="quiet" onClick={(clickEvent) => { clickEvent.preventDefault(); onOpenActor(event.actor); }}>{actorName}</Link> : <strong>{actorName}</strong>}
    </div>
  </div>;
}

function EventMetadata({ event, onOpenActor }) {
  return <div className="onframe-history-event-metadata">
    <ActorLink event={event} onOpenActor={onOpenActor} />
    <div className="onframe-history-metadata-item">
      <Ph n="storefront" size={18} />
      <div><span>Conta</span><strong>{event?.account?.name || 'Conta não identificada'}</strong></div>
    </div>
    <div className="onframe-history-metadata-item">
      <Ph n="calendar-blank" size={18} />
      <div><span>Data e horário</span><time dateTime={event.createdAt}>{formatDate(event.createdAt)}</time></div>
    </div>
  </div>;
}

function ItemReference({ event }) {
  const itemId = event?.item?.id;
  if (!itemId) return null;
  if (!event?.item?.permalink) return <span className="onframe-history-item-reference">Anúncio {itemId}</span>;
  return <Link
    href={event.item.permalink}
    variant="quiet"
    className="onframe-history-item-reference"
    onClick={(clickEvent) => { clickEvent.preventDefault(); openExternal(event.item.permalink); }}
  >
    Anúncio {itemId}<Ph n="arrow-square-out" size={14} />
  </Link>;
}

function CompactContext({ event }) {
  const actorName = event?.actor?.name || event?.actor?.email || 'Pessoa não identificada';
  const accountName = event?.account?.name;
  return <div className="onframe-history-compact-context">
    <Avatar name={actorName} src={event?.actor?.avatarUrl} alt="" size={18} />
    <span className="onframe-history-compact-actor">{actorName}</span>
    {accountName && <Badge tone="grey" size="sm" dot={false}><span className="onframe-history-compact-account">{accountName}</span></Badge>}
  </div>;
}

export function ItemEditEventCard({ event, compact = false, onOpenActor }) {
  const meta = itemEditTypeMeta(event.changeType);
  const content = <div className={`onframe-history-event${compact ? ' onframe-history-event--compact' : ''}`}>
    <div className="onframe-history-event-main">
      <ProductImage event={event} meta={meta} />
      <div className="onframe-history-event-copy">
        <div className="onframe-history-event-title-row">
          <h3 title={itemEditTitle(event)}>{itemEditTitle(event)}</h3>
        </div>
        {compact ? <>
          <div className="onframe-history-compact-change">
            <p className="onframe-history-event-summary" title={event.summary}>{event.summary}</p>
            <time dateTime={event.createdAt} title={formatDate(event.createdAt)}>{formatRelativeDate(event.createdAt)}</time>
          </div>
          <CompactContext event={event} />
        </> : <ItemReference event={event} />}
      </div>
      {!compact && <div className="onframe-history-change-context">
        <span className={`onframe-history-change-icon onframe-history-type-icon--${meta.tone}`}><Ph n={meta.icon} size={17} /></span>
        <div><span>{meta.label}</span><strong>{event.summary}</strong></div>
      </div>}
      {compact && event?.item?.permalink && <Tooltip label="Abrir anúncio" placement="left">
        <Button kind="quiet" tone="primary" size="sm" iconOnly aria-label={`Abrir ${itemEditTitle(event)}`} onClick={() => openExternal(event.item.permalink)} icon={<Ph n="arrow-square-out" size={17} />} />
      </Tooltip>}
    </div>
    {!compact && <>
      <HistoryDetails event={event} />
      <EventMetadata event={event} onOpenActor={onOpenActor} />
    </>}
  </div>;

  return <Card padding={compact ? 12 : 16}>{content}</Card>;
}
