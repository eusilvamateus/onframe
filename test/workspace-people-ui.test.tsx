import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { Button, ListItem, Menu } from '@onblide/ui';
import { create } from 'react-test-renderer';
import { WorkspacePeople } from '../extension/ui/options/WorkspacePeople.jsx';
import { WorkspaceRoles } from '../extension/ui/options/WorkspaceRoles.jsx';
import { SectionHeader } from '../extension/ui/shared/SectionHeader.jsx';

const self = { id: 'user-1', name: 'Pessoa atual', email: 'atual@example.com', roleId: 'admin', accounts: [] };
const other = { id: 'user-2', name: 'Outra pessoa', email: 'outra@example.com', roleId: 'admin', accounts: [] };

function renderPeople(members: (typeof self)[]) {
  const calls: string[] = [];
  const renderer = create(
    <WorkspacePeople
      members={members}
      invitations={[]}
      roles={[{ id: 'admin', name: 'Administrador' }]}
      currentUserId={self.id}
      loading={false}
      onInvite={() => calls.push('invite')}
      onEdit={() => calls.push('edit')}
      onRevoke={() => calls.push('revoke')}
      onLeave={() => calls.push('leave')}
    />
  );
  return { renderer, calls };
}

test('a propria pessoa nao pode gerenciar o proprio acesso pela lista', () => {
  const { renderer, calls } = renderPeople([self, other]);
  const people = renderer.root.findAllByType(ListItem);
  assert.equal(people.length, 2);
  assert.equal(people[0].props.onClick, undefined);
  assert.match(JSON.stringify(people[0].props.title), /Você/);
  people[1].props.onClick();
  assert.deepEqual(calls, ['edit']);
  renderer.unmount();
});

test('saida exige outro administrador e permanece separada da remocao', () => {
  const alone = renderPeople([self]);
  const aloneSection = alone.renderer.root
    .findAllByType(SectionHeader)
    .find((item) => item.props.title === 'Sair do workspace');
  assert.equal(aloneSection?.props.actions.type, Button);
  assert.equal(aloneSection?.props.actions.props.disabled, true);
  alone.renderer.unmount();

  const shared = renderPeople([self, other]);
  const leaveSection = shared.renderer.root
    .findAllByType(SectionHeader)
    .find((item) => item.props.title === 'Sair do workspace');
  assert.equal(leaveSection?.props.actions.props.disabled, false);
  leaveSection?.props.actions.props.onClick();
  assert.deepEqual(shared.calls, ['leave']);
  shared.renderer.unmount();
});

test('administrador e visivel, mas nao pode ser editado ou excluido', () => {
  const renderer = create(
    <WorkspaceRoles
      roles={[
        { id: 'admin', name: 'Administrador', memberCount: 1, permissions: ['accounts.read'] },
        { id: 'custom-1', name: 'Financeiro', memberCount: 1, permissions: [] }
      ]}
      onChanged={() => {}}
    />
  );
  const items = renderer.root.findAllByType(ListItem);
  assert.equal(items.length, 2);
  const menus = renderer.root.findAllByType(Menu);
  assert.equal(menus[0].props.items[0].label, 'Ver permissões');
  assert.equal(menus[0].props.items[3].disabled, true);
  assert.equal(menus[1].props.items[0].label, 'Editar');
  assert.equal(menus[1].props.items[3].disabled, true);
  renderer.unmount();
});
