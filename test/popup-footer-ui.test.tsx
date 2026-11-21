import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { Badge, Button } from '@onblide/ui';
import { create } from 'react-test-renderer';
import { PopupFooter } from '../extension/ui/popup/PopupFooter.jsx';

test('rodapé mostra a versão instalada e permite desconectar', () => {
  const actions: string[] = [];
  const renderer = create(<PopupFooter currentVersion="0.5.0" onDisconnect={() => actions.push('disconnect')} />);

  const version = renderer.root.findByType(Badge);
  assert.equal(version.props.appearance, 'ghost');
  assert.equal(version.props.dot, false);
  assert.equal(version.props.children.join(''), 'v0.5.0');
  const disconnect = renderer.root.findAllByType(Button).find((button) => button.props.children === 'Desconectar');
  assert.equal(disconnect?.props.kind, 'quiet');
  assert.equal(disconnect?.props.tone, 'danger');
  disconnect?.props.onClick();
  assert.deepEqual(actions, ['disconnect']);
  renderer.unmount();
});

test('rodapé desabilita desconexão enquanto há operação em curso', () => {
  const renderer = create(<PopupFooter busy currentVersion="0.5.0" onDisconnect={() => {}} />);
  assert.equal(renderer.root.findByType(Button).props.disabled, true);
  renderer.unmount();
});
