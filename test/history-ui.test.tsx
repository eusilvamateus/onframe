import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { Avatar, Badge, Button, Chip, Datepicker, Link, Pagination, Popover, Select, Tooltip } from '@onblide/ui';
import { act, create } from 'react-test-renderer';
import { HistorySession } from '../extension/ui/popup/HistorySession.jsx';
import { historyPeriodLabel, historyPeriodQuery, ItemEditHistory } from '../extension/ui/options/ItemEditHistory.jsx';
import { ItemEditEventCard } from '../extension/ui/shared/ItemEditEvent.jsx';
import { formatRelativeDate } from '../extension/ui/shared/runtime.js';

const firstEvent = {
  id: 'event-1',
  item: { id: 'MLB1234567890', title: 'Produto de teste', thumbnailUrl: 'https://http2.mlstatic.com/item.jpg', permalink: 'https://produto.mercadolivre.com.br/MLB-1234567890' },
  account: { id: 'account-1', name: 'Loja principal', meliUserId: '123' },
  actor: { id: 'user-1', name: 'Mateus Silva', email: 'mateus@example.com', avatarUrl: 'https://example.com/mateus.jpg' },
  changeType: 'price', action: 'updated', summary: 'Preço alterado',
  detailsVersion: 1,
  details: { before: { amount: 100, currency: 'BRL' }, after: { amount: 120, currency: 'BRL' } },
  createdAt: '2026-10-13T12:00:00.000Z'
};

const promotionEvent = {
  ...firstEvent,
  id: 'event-promotion',
  changeType: 'promotion',
  action: 'created',
  summary: 'Promoção adicionada',
  operation: 'promotion.offer.create',
  details: {
    promotion: { type: 'SELLER_CAMPAIGN', id: 'C-MLB123', offerId: null, name: 'Desconto de Outubro' },
    before: { status: 'inactive', price: { amount: 100, currency: 'BRL' }, discountPercentage: null, stock: null, startDate: null, endDate: null },
    after: { status: 'active', price: { amount: 80, currency: 'BRL' }, discountPercentage: 20, stock: null, startDate: '2026-10-01', endDate: '2026-10-31' },
    changedFields: ['status', 'price', 'discountPercentage', 'startDate', 'endDate'],
    origin: { mode: 'bulk', scope: 'user_product_family' }
  }
};

function installChromeMock(messages: Array<Record<string, unknown>>, firstPageEvents = [firstEvent]) {
  globalThis.document = {
    addEventListener() {},
    removeEventListener() {}
  } as typeof document;
  globalThis.chrome = {
    runtime: {
      lastError: null,
      sendMessage(message, callback) {
        messages.push(message);
        const page = Number(message.query?.page || 1);
        callback({ ok: true, body: message.query?.cursor || page === 2
          ? { events: [{ ...firstEvent, id: 'event-2' }], page: 2, total: 11, totalPages: 2, nextCursor: null }
          : { events: firstPageEvents, page: 1, total: firstPageEvents.length ? 11 : 0, totalPages: firstPageEvents.length ? 2 : 1, nextCursor: firstPageEvents.length ? '100.event-cursor' : null } });
      }
    },
    tabs: { create() {} }
  } as typeof chrome;
}

test('popup resume alteracoes recentes e abre o relatorio completo', async () => {
  const messages: Array<Record<string, unknown>> = [];
  installChromeMock(messages);
  let opened = false;
  let renderer;
  await act(async () => {
    renderer = create(<HistorySession
      connection={{ workspace: { id: 'workspace-1', name: 'Meu workspace' } }}
      onBack={() => {}}
      onOpenFullHistory={() => { opened = true; }}
      header={<div data-popup-user-header="true" />}
    />);
  });

  assert.equal(messages[0].action, 'item-edit-history');
  assert.equal(messages[0].query.limit, 5);
  assert.equal(renderer.root.findByProps({ 'data-popup-user-header': 'true' }).type, 'div');
  const backButton = renderer.root.findAllByType(Button).find((button) => button.props.children === 'Voltar');
  assert.equal(backButton.props.kind, 'quiet');
  assert.equal(backButton.props.tone, 'primary');
  assert.equal(backButton.props.size, 'sm');
  assert.equal(backButton.props.icon.props.n, 'caret-circle-left');
  assert.equal(renderer.root.findByType(ItemEditEventCard).props.compact, true);
  assert.equal(renderer.root.findByType(Avatar).props.src, 'https://example.com/mateus.jpg');
  assert.equal(renderer.root.findByProps({ className: 'onframe-history-compact-account' }).children[0], 'Loja principal');
  assert.equal(renderer.root.findByType('time').props.dateTime, firstEvent.createdAt);
  const loadMore = renderer.root.findAllByType(Button).find((button) => button.props.children === 'Carregar mais');
  assert.equal(loadMore.props.kind, 'quiet');
  assert.equal(loadMore.props.tone, 'primary');
  assert.equal(loadMore.props.size, 'sm');
  await act(async () => {
    loadMore.props.onClick();
    await Promise.resolve();
  });
  assert.deepEqual(messages[1].query, { limit: 5, cursor: '100.event-cursor' });
  assert.equal(renderer.root.findAllByType(ItemEditEventCard).length, 2);
  assert.equal(renderer.root.findAllByType(Button).some((button) => button.props.children === 'Carregar mais'), false);
  const fullHistory = renderer.root.findAllByType(Button).find((button) => button.props.children === 'Ver tudo');
  await act(async () => fullHistory.props.onClick());
  assert.equal(opened, true);
  renderer.unmount();
});

test('data compacta preserva leitura curta sem perder a data completa', () => {
  const reference = new Date('2026-10-13T13:00:00.000Z').getTime();
  assert.equal(formatRelativeDate('2026-10-13T12:59:30.000Z', reference), 'agora');
  assert.equal(formatRelativeDate('2026-10-13T12:10:00.000Z', reference), 'há 50 min');
  assert.equal(formatRelativeDate('2026-10-13T07:00:00.000Z', reference), 'há 6 h');
  assert.equal(formatRelativeDate('2026-10-11T13:00:00.000Z', reference), 'há 2 dias');
});

test('titulo truncado do historico compacto revela o texto completo em tooltip', async () => {
  let renderer;
  await act(async () => {
    renderer = create(<ItemEditEventCard event={firstEvent} compact />, {
      createNodeMock(element) {
        return element.props.className === 'onframe-history-event-title-container'
          ? { querySelector: () => ({ scrollWidth: 360, clientWidth: 180 }) }
          : null;
      }
    });
  });

  const titleTooltip = renderer.root.findAllByType(Tooltip).find((tooltip) => tooltip.props.label?.props?.children === firstEvent.item.title);
  assert.ok(titleTooltip);
  assert.equal(titleTooltip.props.placement, 'bottom');
  renderer.unmount();
});

test('card revela detalhes da promocao no proprio item do historico', async () => {
  let renderer;
  await act(async () => { renderer = create(<ItemEditEventCard event={promotionEvent} />); });

  let output = JSON.stringify(renderer.toJSON());
  assert.equal(output.includes('Desconto de Outubro'), false);
  const disclosure = renderer.root.findAllByType(Button).find((button) => String(button.props['aria-label']).startsWith('Ver detalhes'));
  assert.ok(disclosure);
  assert.equal(disclosure.props.kind, 'quiet');
  assert.equal(disclosure.props.pressed, false);
  assert.equal(disclosure.props['aria-expanded'], false);

  await act(async () => disclosure.props.onClick());
  output = JSON.stringify(renderer.toJSON());
  assert.equal(output.includes('Desconto de Outubro'), true);
  assert.equal(output.includes('Campanha do vendedor'), true);
  assert.equal(output.includes('R$ 100,00'), true);
  assert.equal(output.includes('R$ 80,00'), true);
  assert.equal(output.includes('Aplicada à família de anúncios.'), true);
  assert.ok(renderer.root.findByProps({ 'aria-label': 'Alteração de promoção' }));

  const closeDisclosure = renderer.root.findAllByType(Button).find((button) => String(button.props['aria-label']).startsWith('Ocultar detalhes'));
  assert.equal(closeDisclosure.props.pressed, true);
  assert.equal(closeDisclosure.props['aria-expanded'], true);
  renderer.unmount();
});

test('cards detalham descricao ficha tecnica e fotos somente quando existe conteudo', async () => {
  const cases = [
    {
      event: { ...firstEvent, id: 'description', changeType: 'description', action: 'updated', summary: 'Descrição alterada', details: { before: { exists: true, length: 120 }, after: { exists: true, length: 180 } } },
      expected: ['Descrição existente', 'Descrição atualizada', '180 caracteres']
    },
    {
      event: { ...firstEvent, id: 'characteristics', changeType: 'characteristics', action: 'updated', summary: '1 característica alterada', details: { changes: [{ id: 'COLOR', label: 'Cor', before: 'Azul', after: 'Verde' }] } },
      expected: ['Cor', 'Azul', 'Verde']
    },
    {
      event: { ...firstEvent, id: 'pictures', changeType: 'pictures', action: 'updated', summary: 'Fotos alteradas', details: { beforeCount: 2, afterCount: 3, added: [{ id: 'C', thumbnailUrl: '' }], removed: [], reordered: true } },
      expected: ['2 fotos', '3 fotos', 'Foto adicionada', 'A ordem das fotos foi alterada.']
    }
  ];

  for (const entry of cases) {
    let renderer;
    await act(async () => { renderer = create(<ItemEditEventCard event={entry.event} />); });
    const disclosure = renderer.root.findAllByType(Button).find((button) => String(button.props['aria-label']).startsWith('Ver detalhes'));
    assert.ok(disclosure);
    await act(async () => disclosure.props.onClick());
    const output = JSON.stringify(renderer.toJSON());
    entry.expected.forEach((text) => assert.equal(output.includes(text), true));
    renderer.unmount();
  }

  let legacyRenderer;
  await act(async () => { legacyRenderer = create(<ItemEditEventCard event={{ ...promotionEvent, id: 'legacy', detailsVersion: 0, details: {} }} />); });
  assert.equal(legacyRenderer.root.findAllByType(Button).some((button) => String(button.props['aria-label']).startsWith('Ver detalhes')), false);
  legacyRenderer.unmount();
});

test('periodo personalizado gera limites locais completos para a consulta', () => {
  assert.deepEqual(historyPeriodQuery({ start: '2025-01-02', end: '2025-01-05' }), {
    from: new Date(2025, 0, 2, 0, 0, 0, 0).getTime(),
    to: new Date(2025, 0, 5, 23, 59, 59, 999).getTime()
  });
  assert.deepEqual(historyPeriodQuery({ start: '', end: '' }), { from: '', to: '' });
  const hoje = new Date(2026, 9, 14);
  assert.equal(historyPeriodLabel({ start: '2026-08-01', end: '2026-10-31' }, hoje), 'Agosto - Outubro');
  assert.equal(historyPeriodLabel({ start: '2026-08-05', end: '2026-10-14' }, hoje), '05 Agosto - 14 Outubro');
  assert.equal(historyPeriodLabel({ start: '', end: '' }, hoje), 'Sem filtro');
});

test('opcoes filtram e paginam o historico detalhado', async () => {
  const messages: Array<Record<string, unknown>> = [];
  installChromeMock(messages);
  let openedActor = null;
  let renderer;
  await act(async () => {
    renderer = create(<ItemEditHistory
      accounts={[{ id: 'account-1', user_id: '123', display_name: 'Loja principal' }]}
      members={[{ id: 'user-1', name: 'Mateus Silva', email: 'mateus@example.com' }]}
      currentUser={{ id: 'user-1', name: 'Mateus Silva', email: 'mateus@example.com' }}
      admin
      onOpenActor={(actor) => { openedActor = actor; }}
    />);
  });

  const popovers = renderer.root.findAllByType(Popover);
  assert.deepEqual(popovers.map((popover) => popover.props.title), ['Período', 'Filtrar histórico']);
  const periodPopover = popovers.find((popover) => popover.props.title === 'Período');
  assert.equal(periodPopover.props.width, 308);
  const periodTooltip = renderer.root.findAllByType(Tooltip).find((tooltip) => tooltip.props.label === 'Período');
  assert.ok(periodTooltip);
  assert.equal(periodPopover.props.trigger.type, Chip);
  assert.equal(periodPopover.props.trigger.props.label, 'Sem filtro');
  assert.equal(periodPopover.props.trigger.props.size, 'md');
  let periodRenderer;
  await act(async () => { periodRenderer = create(periodPopover.props.children(() => {})); });
  assert.equal(periodRenderer.root.findAllByType(Datepicker).length, 0);
  const periodChips = periodRenderer.root.findAllByType(Chip);
  assert.deepEqual(periodChips.map((chip) => chip.props.label), ['Sem filtro', 'Últimos 7 dias', 'Últimos 30 dias', 'Do dia', 'Do mês', 'Intervalo']);
  assert.equal(periodChips.filter((chip) => chip.props.selected).length, 1);
  await act(async () => periodChips.find((chip) => chip.props.label === 'Últimos 7 dias').props.onToggle());
  periodRenderer.unmount();
  let updatedPeriodPopover = renderer.root.findAllByType(Popover).find((popover) => popover.props.title === 'Período');
  await act(async () => { periodRenderer = create(updatedPeriodPopover.props.children(() => {})); });
  let datepicker = periodRenderer.root.findByType(Datepicker);
  assert.equal(datepicker.props.mode, 'range');
  assert.equal(datepicker.props.label, 'Intervalo');
  assert.ok(datepicker.props.value.start instanceof Date);
  assert.ok(datepicker.props.value.end instanceof Date);
  periodRenderer.unmount();
  updatedPeriodPopover = renderer.root.findAllByType(Popover).find((popover) => popover.props.title === 'Período');
  await act(async () => { periodRenderer = create(updatedPeriodPopover.props.children(() => {})); });
  await act(async () => periodRenderer.root.findAllByType(Chip).find((chip) => chip.props.label === 'Do dia').props.onToggle());
  periodRenderer.unmount();
  updatedPeriodPopover = renderer.root.findAllByType(Popover).find((popover) => popover.props.title === 'Período');
  await act(async () => { periodRenderer = create(updatedPeriodPopover.props.children(() => {})); });
  datepicker = periodRenderer.root.findByType(Datepicker);
  assert.equal(datepicker.props.label, 'Dia');
  assert.equal(datepicker.props.stepper, 'day');
  assert.equal(datepicker.props.calendarDisplay, 'popover');
  assert.ok(datepicker.props.value instanceof Date);
  periodRenderer.unmount();
  updatedPeriodPopover = renderer.root.findAllByType(Popover).find((popover) => popover.props.title === 'Período');
  await act(async () => { periodRenderer = create(updatedPeriodPopover.props.children(() => {})); });
  await act(async () => periodRenderer.root.findAllByType(Chip).find((chip) => chip.props.label === 'Do mês').props.onToggle());
  periodRenderer.unmount();
  updatedPeriodPopover = renderer.root.findAllByType(Popover).find((popover) => popover.props.title === 'Período');
  await act(async () => { periodRenderer = create(updatedPeriodPopover.props.children(() => {})); });
  datepicker = periodRenderer.root.findByType(Datepicker);
  assert.equal(datepicker.props.label, 'Mês');
  assert.equal(datepicker.props.stepper, 'month');
  assert.equal(datepicker.props.calendarDisplay, 'popover');
  periodRenderer.unmount();
  updatedPeriodPopover = renderer.root.findAllByType(Popover).find((popover) => popover.props.title === 'Período');
  await act(async () => { periodRenderer = create(updatedPeriodPopover.props.children(() => {})); });
  await act(async () => periodRenderer.root.findAllByType(Chip).find((chip) => chip.props.label === 'Intervalo').props.onToggle());
  periodRenderer.unmount();
  updatedPeriodPopover = renderer.root.findAllByType(Popover).find((popover) => popover.props.title === 'Período');
  await act(async () => { periodRenderer = create(updatedPeriodPopover.props.children(() => {})); });
  datepicker = periodRenderer.root.findByType(Datepicker);
  assert.equal(datepicker.props.mode, 'range');
  assert.equal(datepicker.props.calendarDisplay, 'popover');
  assert.equal(datepicker.props.label, 'Intervalo');
  assert.equal(periodRenderer.root.findAllByProps({ type: 'date' }).length, 0);
  assert.ok(periodRenderer.root.findAllByType(Button).some((button) => button.props.children === 'Limpar'));
  assert.equal(periodRenderer.root.findAllByType(Button).find((button) => button.props.children === 'Aplicar período').props.disabled, true);
  periodRenderer.unmount();
  assert.equal(renderer.root.findByType(ItemEditEventCard).props.compact, undefined);
  assert.equal(renderer.root.findAllByType(Badge).length, 0);
  const actorLink = renderer.root.findAllByType(Link).find((link) => link.props.href === '#configuracoes-workspace-people');
  await act(async () => actorLink.props.onClick({ preventDefault() {} }));
  assert.equal(openedActor.id, 'user-1');
  assert.equal(renderer.root.findAllByProps({ 'aria-label': 'Alteração de preço' }).length, 0);
  const detailButton = renderer.root.findAllByType(Button).find((button) => String(button.props['aria-label']).startsWith('Ver detalhes de Produto de teste'));
  assert.ok(detailButton);
  await act(async () => detailButton.props.onClick());
  assert.equal(renderer.root.findByProps({ 'aria-label': 'Alteração de preço' }).children.length > 0, true);
  const pagination = renderer.root.findByType(Pagination);
  await act(async () => {
    pagination.props.onChange(2);
    await Promise.resolve();
  });
  assert.equal(messages.some((message) => message.query?.page === 2 && message.query?.limit === 10), true);
  assert.equal(renderer.root.findAllByType(ItemEditEventCard).length, 1);

  const filterPopover = renderer.root.findAllByType(Popover).find((popover) => popover.props.title === 'Filtrar histórico');
  assert.equal(filterPopover.props.width, 308);
  assert.equal(filterPopover.props.trigger.props.size, 'md');
  assert.equal(filterPopover.props.trigger.props.children, 'Filtros');
  assert.equal(filterPopover.props.trigger.props.count, undefined);
  assert.equal(filterPopover.props.trigger.props.countTone, 'blue');
  let filterRenderer;
  await act(async () => { filterRenderer = create(filterPopover.props.children(() => {})); });
  const filterSelects = filterRenderer.root.findAllByType(Select);
  assert.equal(filterSelects.length, 3);
  const optionLabels = filterSelects.flatMap((select) => select.props.options.map((option) => option.label));
  assert.equal(optionLabels.includes('Loja principal'), true);
  assert.equal(optionLabels.includes('Loja principal · 123'), false);
  assert.equal(optionLabels.includes('Mateus Silva'), true);
  assert.equal(optionLabels.includes('Mateus Silva · mateus@example.com'), false);
  filterRenderer.unmount();
  renderer.unmount();
});

test('opcoes mantem o icone do estado vazio em um tile de tamanho fixo', async () => {
  const messages: Array<Record<string, unknown>> = [];
  installChromeMock(messages, []);
  let renderer;
  await act(async () => {
    renderer = create(<ItemEditHistory accounts={[]} members={[]} currentUser={null} admin={false} />);
  });

  const emptyIcon = renderer.root.findByProps({ className: 'onframe-popup-icon-tile onframe-popup-icon-tile--green' });
  assert.equal(emptyIcon.props.children.props.n, 'clock-counter-clockwise');
  renderer.unmount();
});
