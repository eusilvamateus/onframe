import { useId, useState } from 'react';
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

function formatCount(value, singular, plural) {
  if (value === undefined || value === null || value === '') return 'Não informado';
  const count = Number(value);
  if (!Number.isFinite(count)) return 'Não informado';
  return `${count} ${count === 1 ? singular : plural}`;
}

function formatPercentage(value) {
  if (value === undefined || value === null || value === '') return 'Não informado';
  const percentage = Number(value);
  if (!Number.isFinite(percentage)) return 'Não informado';
  return `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(percentage)}%`;
}

function formatHistoryDate(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/u);
  const date = match
    ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
    : new Date(value);
  if (!value || Number.isNaN(date.getTime())) return 'Não informado';
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
}

function readablePromotionType(value) {
  const types = {
    SELLER_CAMPAIGN: 'Campanha do vendedor',
    DEAL: 'Campanha do Mercado Livre',
    SMART: 'Oferta inteligente',
    LIGHTNING: 'Oferta relâmpago',
    MARKETPLACE_CAMPAIGN: 'Campanha do Mercado Livre',
    SELLER_COUPON_CAMPAIGN: 'Cupom do vendedor',
    ITEM_COUPON: 'Cupom do anúncio',
    BANK: 'Benefício por meio de pagamento'
  };
  const type = String(value || '').trim().toUpperCase();
  return types[type] || type.toLowerCase().replaceAll('_', ' ').replace(/^./u, (letter) => letter.toUpperCase()) || 'Promoção';
}

function promotionStatus(value) {
  return {
    active: 'Ativa',
    scheduled: 'Programada',
    inactive: 'Inativa'
  }[String(value || '').toLowerCase()] || 'Não informado';
}

function hasEventDetails(event) {
  const details = event?.details || {};
  if (event?.changeType === 'price') return details.before !== undefined || details.after !== undefined;
  if (event?.changeType === 'description') return Boolean(details.before || details.after);
  if (event?.changeType === 'characteristics') return Array.isArray(details.changes) && details.changes.length > 0;
  if (event?.changeType === 'pictures') return details.beforeCount !== undefined || details.afterCount !== undefined || Boolean(details.reordered) || Boolean(details.added?.length) || Boolean(details.removed?.length);
  if (event?.changeType === 'promotion') return Boolean(details.promotion || details.before || details.after);
  return false;
}

function ProductImage({ event, meta }) {
  return <span className="onframe-history-product-media">
    <span className={`onframe-history-type-icon onframe-history-type-icon--${meta.tone}`}><Ph n={meta.icon} size={20} /></span>
    {event?.item?.thumbnailUrl && <img className="onframe-history-product-image" src={event.item.thumbnailUrl} alt="" onError={(image) => { image.currentTarget.style.display = 'none'; }} />}
  </span>;
}

function ComparisonRows({ rows, ariaLabel }) {
  const visibleRows = rows.filter(Boolean);
  if (!visibleRows.length) return null;
  return <dl className="onframe-history-comparison" aria-label={ariaLabel}>
    {visibleRows.map((row) => <div key={row.label}>
      <dt>{row.label}</dt>
      <dd>
        <span>{row.before}</span>
        <Ph n="arrow-right" size={14} />
        <strong>{row.after}</strong>
      </dd>
    </div>)}
  </dl>;
}

function DescriptionDetails({ event, details }) {
  const before = details.before || {};
  const after = details.after || {};
  const created = event.action === 'created' || before.exists === false;
  return <ComparisonRows ariaLabel="Alteração de descrição" rows={[
    {
      label: 'Situação',
      before: before.exists ? 'Descrição existente' : 'Sem descrição',
      after: after.exists === false ? 'Sem descrição' : created ? 'Descrição adicionada' : 'Descrição atualizada'
    },
    {
      label: 'Tamanho',
      before: formatCount(before.length, 'caractere', 'caracteres'),
      after: formatCount(after.length, 'caractere', 'caracteres')
    }
  ]} />;
}

function PictureCollection({ title, pictures, tone }) {
  if (!Array.isArray(pictures) || pictures.length === 0) return null;
  return <div className="onframe-history-picture-group">
    <span>{title}</span>
    <div className="onframe-history-picture-list">
      {pictures.map((picture, index) => <div key={picture.id || picture.thumbnailUrl || index} className={`onframe-history-picture-item onframe-history-picture-item--${tone}`}>
        {picture.thumbnailUrl ? <img src={picture.thumbnailUrl} alt="" /> : <Ph n="image" size={18} />}
        <span>{tone === 'added' ? 'Foto adicionada' : 'Foto removida'}</span>
      </div>)}
    </div>
  </div>;
}

function PictureDetails({ details }) {
  return <div className="onframe-history-picture-details">
    <ComparisonRows ariaLabel="Alteração de fotos" rows={[{
      label: 'Quantidade',
      before: formatCount(details.beforeCount, 'foto', 'fotos'),
      after: formatCount(details.afterCount, 'foto', 'fotos')
    }]} />
    {details.reordered && <p className="onframe-history-detail-note"><Ph n="arrows-down-up" size={16} />A ordem das fotos foi alterada.</p>}
    <PictureCollection title="Adicionadas" pictures={details.added} tone="added" />
    <PictureCollection title="Removidas" pictures={details.removed} tone="removed" />
  </div>;
}

function promotionValue(state, field) {
  if (!state) return field === 'status' ? 'Sem participação' : 'Não informado';
  if (field === 'status') return promotionStatus(state.status);
  if (field === 'price') return formatMoney(state.price);
  if (field === 'discountPercentage') return formatPercentage(state.discountPercentage);
  if (field === 'stock') return formatCount(state.stock, 'unidade', 'unidades');
  if (field === 'startDate' || field === 'endDate') return formatHistoryDate(state[field]);
  return 'Não informado';
}

function PromotionDetails({ details }) {
  const promotion = details.promotion || {};
  const fields = Array.isArray(details.changedFields) && details.changedFields.length > 0
    ? details.changedFields
    : ['status', 'price', 'discountPercentage', 'stock', 'startDate', 'endDate'];
  const labels = {
    status: 'Situação',
    price: 'Preço promocional',
    discountPercentage: 'Desconto',
    stock: 'Estoque reservado',
    startDate: 'Início',
    endDate: 'Término'
  };
  const rows = fields.filter((field) => labels[field]).map((field) => ({
    label: labels[field],
    before: promotionValue(details.before, field),
    after: promotionValue(details.after, field)
  }));
  const bulk = details.origin?.mode === 'bulk';

  return <div className="onframe-history-promotion-details">
    <div className="onframe-history-detail-heading">
      <span className="onframe-history-type-icon onframe-history-type-icon--red"><Ph n="tag" size={17} /></span>
      <div>
        <span>{readablePromotionType(promotion.type)}</span>
        <strong>{promotion.name || 'Promoção sem nome informado'}</strong>
      </div>
    </div>
    <ComparisonRows ariaLabel="Alteração de promoção" rows={rows} />
    <p className="onframe-history-detail-note"><Ph n={bulk ? 'stack' : 'file'} size={16} />{bulk ? 'Aplicada à família de anúncios.' : 'Aplicada somente a este anúncio.'}</p>
  </div>;
}

function HistoryDetails({ event }) {
  const details = event?.details || {};
  if (event.changeType === 'price') return <ComparisonRows ariaLabel="Alteração de preço" rows={[{
    label: 'Preço',
    before: formatMoney(details.before, details.currency),
    after: formatMoney(details.after, details.currency)
  }]} />;

  if (event.changeType === 'description') return <DescriptionDetails event={event} details={details} />;

  if (event.changeType === 'characteristics' && Array.isArray(details.changes) && details.changes.length > 0) {
    return <ComparisonRows ariaLabel="Alteração de ficha técnica" rows={details.changes.map((change) => ({
      label: change.label || change.id,
      before: change.before || 'Não informado',
      after: change.after || 'Não informado'
    }))} />;
  }

  if (event.changeType === 'pictures') return <PictureDetails details={details} />;

  if (event.changeType === 'promotion') return <PromotionDetails details={details} />;

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
  const [expanded, setExpanded] = useState(false);
  const detailsId = useId();
  const meta = itemEditTypeMeta(event.changeType);
  const expandable = !compact && hasEventDetails(event);
  const detailAction = expanded ? 'Ocultar detalhes' : 'Ver detalhes';
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
        <div className="onframe-history-change-copy"><span>{meta.label}</span><strong>{event.summary}</strong></div>
        {expandable && <Tooltip label={detailAction} placement="left">
          <Button
            kind="quiet"
            tone="neutral"
            size="sm"
            iconOnly
            pressed={expanded}
            aria-label={`${detailAction} de ${itemEditTitle(event)}`}
            aria-expanded={expanded}
            aria-controls={detailsId}
            onClick={() => setExpanded((value) => !value)}
            icon={<Ph n={expanded ? 'caret-up' : 'caret-down'} size={16} />}
          />
        </Tooltip>}
      </div>}
      {compact && event?.item?.permalink && <Tooltip label="Abrir anúncio" placement="left">
        <Button kind="quiet" tone="primary" size="sm" iconOnly aria-label={`Abrir ${itemEditTitle(event)}`} onClick={() => openExternal(event.item.permalink)} icon={<Ph n="arrow-square-out" size={17} />} />
      </Tooltip>}
    </div>
    {!compact && <>
      {expandable && expanded && <section id={detailsId} className="onframe-history-expanded-details" aria-label={`Detalhes de ${event.summary}`}>
        <HistoryDetails event={event} />
      </section>}
      <EventMetadata event={event} onOpenActor={onOpenActor} />
    </>}
  </div>;

  return <Card padding={compact ? 12 : 16}>{content}</Card>;
}
