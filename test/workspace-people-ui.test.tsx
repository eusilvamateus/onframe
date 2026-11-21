import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import React from 'react';
import { ListItem, Menu } from '@onblide/ui';
import { create } from 'react-test-renderer';
import { WorkspacePeople } from '../extension/ui/options/WorkspacePeople.jsx';
import { WorkspaceRoles } from '../extension/ui/options/WorkspaceRoles.jsx';

globalThis.document = {
  addEventListener() {},
  removeEventListener() {}
} as unknown as Document;

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
  assert.match(JSON.stringify(renderer.toJSON()), /Você/);
  people[1].props.onClick();
  assert.deepEqual(calls, ['edit']);
  renderer.unmount();
});

test('saida exige outro administrador e fica em Geral, separada da lista de pessoas', () => {
  const people = renderPeople([self, other]);
  assert.equal(people.renderer.root.findAllByType(ListItem).length, 2);
  assert.equal(people.renderer.root.findAllByType(ListItem).some((item) => item.props.title === 'Sair do workspace'), false);
  people.renderer.unmount();

  const options = readFileSync(path.join(process.cwd(), 'extension/ui/options/app.jsx'), 'utf8');
  assert.match(options, /const canLeave = details\?\.roleId !== 'admin' \|\| details\?\.adminCount > 1/);
  assert.match(options, /title="Acesso ao workspace"[\s\S]*?disabled=\{loading \|\| !canLeave\} onClick=\{onLeave\}/);
});

test('administrador fica separado dos perfis editaveis', () => {
  const renderer = create(
    <WorkspaceRoles
      roles={[
        { id: 'admin', name: 'Administrador', memberCount: 1, permissions: ['accounts.read'] },
        { id: 'custom-1', name: 'Financeiro', memberCount: 1, permissions: [] }
      ]}
      onChanged={() => {}}
    />
  );
  const administration = renderer.root.findByProps({ 'aria-label': 'Administração do workspace' });
  assert.equal(administration.findAllByType(Menu).length, 0);
  assert.equal(administration.findAllByType(ListItem).length, 0);
  const items = renderer.root.findAllByType(ListItem);
  assert.equal(items.length, 1);
  assert.equal(items[0].props.title, 'Financeiro');
  const menus = renderer.root.findAllByType(Menu);
  assert.equal(menus.length, 1);
  assert.equal(menus[0].props.items[0].label, 'Editar');
  assert.equal(menus[0].props.items[3].disabled, true);
  renderer.unmount();
});
