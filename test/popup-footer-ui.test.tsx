import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { Button, Menu } from '@onblide/ui';
import { create } from 'react-test-renderer';
import { isNewerVersion, PopupFooter } from '../extension/ui/popup/PopupFooter.jsx';

test('compara versões semânticas da extensão', () => {
  assert.equal(isNewerVersion('0.6.0', '0.5.0'), true);
  assert.equal(isNewerVersion('0.5.1', '0.5.0'), true);
  assert.equal(isNewerVersion('1.0.0', '0.9.9'), true);
  assert.equal(isNewerVersion('0.5.0', '0.5.0'), false);
  assert.equal(isNewerVersion('0.4.9', '0.5.0'), false);
  assert.equal(isNewerVersion('latest', '0.5.0'), false);
});

test('rodapé indica atualização e oferece changelog, atualizador e logout', () => {
  const actions: string[] = [];
  const release = {
    latestVersion: '0.6.0',
    changelogUrl: 'https://github.com/eusilvamateus/onframe/releases/tag/v0.6.0'
  };
  const renderer = create(<PopupFooter
    release={release}
    currentVersion="0.5.0"
    onOpenChangelog={(url) => actions.push(`changelog:${url}`)}
    onUpdate={() => actions.push('update')}
    onDisconnect={() => actions.push('disconnect')}
  />);

  const menu = renderer.root.findByType(Menu);
  assert.equal(menu.props.placement, 'top');
  assert.equal(menu.props.align, 'left');
  assert.equal(menu.props.size, 'sm');
  assert.equal(menu.props.trigger.props.kind, 'cream');
  assert.equal(menu.props.trigger.props.size, 'sm');
  assert.equal(menu.props.trigger.props.count, 1);
  assert.match(menu.props.trigger.props['aria-label'], /atualização 0\.6\.0 disponível/);
  assert.deepEqual(menu.props.items.map((item: { label: string }) => item.label), [
    'Ver changelog da v0.6.0',
    'Atualizar para v0.6.0'
  ]);

  menu.props.items[0].onSelect();
  menu.props.items[1].onSelect();
  const disconnect = renderer.root.findAllByType(Button).find((button) => button.props.children === 'Desconectar');
  assert.equal(disconnect?.props.kind, 'quiet');
  assert.equal(disconnect?.props.tone, 'danger');
  disconnect?.props.onClick();
  assert.deepEqual(actions, [`changelog:${release.changelogUrl}`, 'update', 'disconnect']);
  renderer.unmount();
});

test('rodapé mantém a versão acessível quando não há atualização ou consulta', () => {
  const updated = create(<PopupFooter release={{ latestVersion: '0.4.4' }} currentVersion="0.5.0" onDisconnect={() => {}} />);
  const updatedMenu = updated.root.findByType(Menu);
  assert.equal(updatedMenu.props.trigger.props.count, undefined);
  assert.equal(updatedMenu.props.items[0].label, 'Extensão atualizada');
  assert.equal(updatedMenu.props.items[0].disabled, true);
  updated.unmount();

  const unavailable = create(<PopupFooter release={null} currentVersion="0.5.0" onDisconnect={() => {}} />);
  assert.equal(unavailable.root.findByType(Menu).props.items[0].label, 'Não foi possível verificar atualizações');
  unavailable.unmount();
});
