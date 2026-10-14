import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { Avatar, Badge, Button, Link, Select } from '@onblide/ui';
import { act, create } from 'react-test-renderer';
import { HistorySession } from '../extension/ui/popup/HistorySession.jsx';
import { ItemEditHistory } from '../extension/ui/options/ItemEditHistory.jsx';
import { ItemEditEventCard } from '../extension/ui/shared/ItemEditEvent.jsx';
import { formatRelativeDate } from '../extension/ui/shared/runtime.js';

const firstEvent = {
  id: 'event-1',
  item: { id: 'MLB1234567890', title: 'Produto de teste', thumbnailUrl: 'https://http2.mlstatic.com/item.jpg', permalink: 'https://produto.mercadolivre.com.br/MLB-1234567890' },
  account: { id: 'account-1', name: 'Loja principal', meliUserId: '123' },
  actor: { id: 'user-1', name: 'Mateus Silva', email: 'mateus@example.com', avatarUrl: 'https://example.com/mateus.jpg' },
  changeType: 'price', action: 'updated', summary: 'Preço alterado',
  details: { before: 100, after: 120, currency: 'BRL' },
  createdAt: '2026-10-13T12:00:00.000Z'
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
        callback({ ok: true, body: message.query?.cursor ? { events: [{ ...firstEvent, id: 'event-2' }], nextCursor: null } : { events: firstPageEvents, nextCursor: firstPageEvents.length ? '100.event-cursor' : null } });
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
      onOpenOptions={() => {}}
      onOpenFullHistory={() => { opened = true; }}
    />);
  });

  assert.equal(messages[0].action, 'item-edit-history');
  assert.equal(messages[0].query.limit, 20);
  assert.equal(renderer.root.findByType(ItemEditEventCard).props.compact, true);
  assert.equal(renderer.root.findByType(Avatar).props.src, 'https://example.com/mateus.jpg');
  const accountBadge = renderer.root.findByType(Badge);
  assert.equal(accountBadge.props.tone, 'grey');
  assert.equal(accountBadge.props.size, 'sm');
  assert.equal(accountBadge.props.dot, false);
  assert.equal(accountBadge.props.children.props.children, 'Loja principal');
  assert.equal(renderer.root.findByType('time').props.dateTime, firstEvent.createdAt);
  const fullHistory = renderer.root.findAllByType(Button).find((button) => button.props.children === 'Abrir histórico completo');
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

  assert.equal(renderer.root.findAllByType(Select).length, 3);
  assert.equal(renderer.root.findByType(ItemEditEventCard).props.compact, undefined);
  const actorLink = renderer.root.findByType(Link);
  await act(async () => actorLink.props.onClick({ preventDefault() {} }));
  assert.equal(openedActor.id, 'user-1');
  assert.equal(renderer.root.findByProps({ 'aria-label': 'Alteração de preço' }).children.length > 0, true);
  const loadMore = renderer.root.findAllByType(Button).find((button) => button.props.children === 'Carregar mais');
  await act(async () => {
    loadMore.props.onClick();
    await Promise.resolve();
  });
  assert.equal(messages.some((message) => message.query?.cursor === '100.event-cursor'), true);
  assert.equal(renderer.root.findAllByType(ItemEditEventCard).length, 2);
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
