import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { Button, Table } from '@onblide/ui';
import { create } from 'react-test-renderer';
import { WorkspacePeople } from '../extension/ui/options/WorkspacePeople.jsx';
import { SectionHeader } from '../extension/ui/shared/SectionHeader.jsx';

const self = { id: 'user-1', name: 'Pessoa atual', email: 'atual@example.com', role: 'admin', accounts: [] };
const other = { id: 'user-2', name: 'Outra pessoa', email: 'outra@example.com', role: 'admin', accounts: [] };

function renderPeople(members: typeof self[]) {
  const calls: string[] = [];
  const renderer = create(<WorkspacePeople
    members={members} invitations={[]} currentUserId={self.id} loading={false}
    onInvite={() => calls.push('invite')}
    onEdit={() => calls.push('edit')}
    onRemove={() => calls.push('remove')}
    onRevoke={() => calls.push('revoke')}
    onLeave={() => calls.push('leave')}
  />);
  return { renderer, calls };
}

test('linha da propria pessoa nao oferece gerenciar ou remover', () => {
  const { renderer, calls } = renderPeople([self, other]);
  const table = renderer.root.findByType(Table);
  const actions = table.props.columns.find((column: { key: string }) => column.key === 'actions');
  assert.equal(actions.render(null, self), null);
  const otherActions = actions.render(null, other);
  assert.equal(otherActions.props.children.length, 2);
  otherActions.props.children[0].props.onClick();
  otherActions.props.children[1].props.onClick();
  assert.deepEqual(calls, ['edit', 'remove']);
  assert.match(JSON.stringify(table.props.columns[0].render(null, self)), /\(você\)/);
  renderer.unmount();
});

test('saida exige outro administrador e permanece separada da remocao', () => {
  const alone = renderPeople([self]);
  const aloneSection = alone.renderer.root.findAllByType(SectionHeader).find((item) => item.props.title === 'Sair do workspace');
  assert.equal(aloneSection?.props.actions.type, Button);
  assert.equal(aloneSection?.props.actions.props.disabled, true);
  alone.renderer.unmount();

  const shared = renderPeople([self, other]);
  const leaveSection = shared.renderer.root.findAllByType(SectionHeader).find((item) => item.props.title === 'Sair do workspace');
  assert.equal(leaveSection?.props.actions.props.disabled, false);
  leaveSection?.props.actions.props.onClick();
  assert.deepEqual(shared.calls, ['leave']);
  shared.renderer.unmount();
});
