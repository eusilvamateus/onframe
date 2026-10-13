import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { ButtonGroup, Modal, Switch } from '@onblide/ui';
import { act, create } from 'react-test-renderer';
import { IntegrationsSession } from '../extension/ui/popup/IntegrationsSession.jsx';
import { IntegrationAccount } from '../extension/ui/shared/IntegrationAccount.jsx';

const account = {
  id: 'account-1',
  user_id: '123456',
  nickname: 'Loja original',
  display_name: 'Loja principal',
  permalink: 'https://perfil.mercadolivre.com.br/loja-principal',
  enabled: true
};

function installChromeMock(messages: Array<Record<string, unknown>>) {
  globalThis.document = {
    addEventListener() {},
    removeEventListener() {}
  } as typeof document;
  globalThis.chrome = {
    runtime: {
      lastError: null,
      sendMessage(message, callback) {
        messages.push(message);
        if (message.action === 'account-update') {
          callback({ ok: true, body: { accounts: [{ ...account, enabled: message.payload.enabled ?? account.enabled, display_name: message.payload.displayName ?? account.display_name }] } });
          return;
        }
        if (message.action === 'account-remove') {
          callback({ ok: true, body: { accounts: [] } });
          return;
        }
        callback({ ok: true, body: { accounts: [account] } });
      }
    },
    tabs: { create() {} }
  } as typeof chrome;
}

test('sessao de integracoes preserva os controles administrativos das contas', async () => {
  const messages: Array<Record<string, unknown>> = [];
  installChromeMock(messages);
  let renderer;
  await act(async () => {
    renderer = create(<IntegrationsSession
      connection={{ workspace: { id: 'workspace-1', name: 'Meu workspace', role: 'admin' } }}
      onBack={() => {}}
      onOpenOptions={() => {}}
    />);
  });

  const integration = renderer.root.findByType(IntegrationAccount);
  assert.equal(integration.props.compact, true);
  assert.equal(integration.props.admin, true);
  assert.equal(renderer.root.findByType(Switch).props.size, 'md');
  assert.equal(renderer.root.findByType(ButtonGroup).props.size, 'md');

  await act(async () => {
    renderer.root.findByProps({ 'aria-label': 'Conectar conta' }).props.onClick();
    await Promise.resolve();
  });
  assert.equal(messages.some((message) => message.action === 'oauth-start'), true);

  await act(async () => integration.props.onUpdate(account, false));
  assert.equal(messages.some((message) => message.action === 'account-update' && message.payload.enabled === false), true);

  await act(async () => integration.props.onRename(account, 'Nome atualizado'));
  assert.equal(messages.some((message) => message.action === 'account-update' && message.payload.displayName === 'Nome atualizado'), true);

  await act(async () => integration.props.onRemove(account));
  const confirmation = renderer.root.findByType(Modal);
  assert.equal(confirmation.props.open, true);
  await act(async () => {
    confirmation.props.footer.props.children[1].props.onClick();
    await Promise.resolve();
  });
  assert.equal(messages.some((message) => message.action === 'account-remove'), true);
  renderer.unmount();
});

test('colaborador visualiza contas sem controles administrativos', async () => {
  installChromeMock([]);
  let renderer;
  await act(async () => {
    renderer = create(<IntegrationsSession
      connection={{ workspace: { id: 'workspace-1', name: 'Meu workspace', role: 'collaborator' } }}
      onBack={() => {}}
      onOpenOptions={() => {}}
    />);
  });

  const integration = renderer.root.findByType(IntegrationAccount);
  assert.equal(integration.props.admin, false);
  assert.equal(renderer.root.findAllByType(Switch).length, 0);
  assert.equal(renderer.root.findAllByProps({ 'aria-label': 'Conectar conta' }).length, 0);
  renderer.unmount();
});
