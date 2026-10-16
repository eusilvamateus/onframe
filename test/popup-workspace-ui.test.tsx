import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { Button, ListItem, Modal, Tooltip } from '@onblide/ui';
import { act, create } from 'react-test-renderer';
import { WorkspaceSession } from '../extension/ui/popup/WorkspaceSession.jsx';

const self = { id: 'user-1', name: 'Pessoa atual', email: 'atual@example.com', role: 'admin', accounts: [] };
const other = { id: 'user-2', name: 'Outra pessoa', email: 'outra@example.com', role: 'admin', accounts: [] };
const invitation = { id: 'invite-1', kind: 'email', email: 'convite@example.com', role: 'collaborator', expiresAt: '2026-10-20T12:00:00.000Z' };

function installChromeMock() {
  globalThis.chrome = {
    runtime: {
      lastError: null,
      sendMessage(message, callback) {
        const responses = {
          members: { members: [self, other] },
          invitations: { invitations: [invitation] },
          accounts: { accounts: [{ id: 'account-1', displayName: 'Loja principal' }] }
        };
        callback({ ok: true, body: responses[message.action] || {} });
      }
    }
  } as typeof chrome;
}

test('sessao do workspace lista pessoas, convites e mantem a propria conta sem acao', async () => {
  installChromeMock();
  let renderer;
  await act(async () => {
    renderer = create(<WorkspaceSession
      connection={{ user: self, workspace: { id: 'workspace-1', name: 'Meu workspace', role: 'admin' } }}
      onBack={() => {}}
      onOpenOptions={() => {}}
      onConnectionChanged={async () => {}}
    />);
  });

  const items = renderer.root.findAllByType(ListItem);
  const selfItem = items.find((item) => item.props.title === self.name);
  const otherItem = items.find((item) => item.props.title === other.name);
  const invitationItem = items.find((item) => item.props.title === invitation.email);
  const leaveItem = items.find((item) => item.props.title === 'Sair do workspace');

  assert.equal(selfItem?.props.onClick, undefined);
  assert.equal(typeof otherItem?.props.onClick, 'function');
  assert.match(String(otherItem?.props.description), /Todas as contas/);
  assert.match(String(invitationItem?.props.description), /Colaborador/);
  assert.equal(leaveItem?.props.disabled, false);
  const inviteButton = renderer.root.findAllByType(Button).find((button) => button.props.children === 'Convidar pessoa');
  assert.equal(inviteButton.props.kind, 'quiet');
  assert.equal(inviteButton.props.tone, 'primary');
  assert.equal(inviteButton.props.size, 'sm');
  assert.equal(renderer.root.findAllByType(Tooltip).some((tooltip) => tooltip.props.label === 'Convidar pessoa'), false);
  renderer.unmount();
});

test('convite em andamento reabre com o rascunho e cancelar limpa a retomada', async () => {
  installChromeMock();
  const originalDocument = globalThis.document;
  globalThis.document = { activeElement: null, addEventListener() {}, removeEventListener() {} } as unknown as Document;
  const states = [];
  let renderer;
  try {
    await act(async () => {
      renderer = create(<WorkspaceSession
        connection={{ user: self, workspace: { id: 'workspace-1', name: 'Meu workspace', role: 'admin' } }}
        initialState={{ inviteOpen: true, inviteDraft: { kind: 'email', email: 'rascunho@example.com', role: 'collaborator', accountIds: ['account-1'] } }}
        onStateChange={(state) => states.push(state)}
        onBack={() => {}}
        onConnectionChanged={async () => {}}
      />);
    });

    const email = renderer.root.findAllByType('input').find((input) => input.props.type === 'email');
    assert.equal(email?.props.value, 'rascunho@example.com');
    await act(async () => email?.props.onChange({ target: { value: 'novo@example.com' } }));
    assert.equal(states.at(-1).inviteOpen, true);
    assert.equal(states.at(-1).inviteDraft.email, 'novo@example.com');

    const accessModal = renderer.root.findAllByType(Modal).find((modal) => modal.props.open);
    await act(async () => accessModal?.props.onClose());
    assert.equal(states.at(-1).inviteOpen, false);
    assert.equal(states.at(-1).inviteDraft.email, '');
  } finally {
    renderer?.unmount();
    globalThis.document = originalDocument;
  }
});
