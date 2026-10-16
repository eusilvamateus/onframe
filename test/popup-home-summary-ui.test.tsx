import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { Skeleton } from '@onblide/ui';
import { create } from 'react-test-renderer';
import { PopupLoading } from '../extension/ui/popup/PopupLoading.jsx';
import { historySummary, integrationsSummary, workspaceSummary } from '../extension/ui/popup/summaries.js';
import { POPUP_SESSION_STATE_KEY, clearPopupSessionState, normalizePopupSessionState, readPopupSessionState, writePopupSessionState } from '../extension/ui/shared/popup-session-state.js';

test('carregamento inicial reserva a estrutura completa do popup', () => {
  const renderer = create(<PopupLoading />);
  const surface = renderer.root.findByProps({ 'aria-label': 'Carregando conta' });
  assert.equal(surface.props['aria-busy'], 'true');
  assert.equal(renderer.root.findAllByProps({ className: 'onframe-popup-home-loading-row' }).length, 3);
  assert.equal(renderer.root.findAllByType(Skeleton).length, 19);
  renderer.unmount();
});

test('resumos do popup apresentam contagens reais com pluralizacao', () => {
  const overview = {
    memberCount: 3,
    pendingInvitationCount: 1,
    accountCount: 2,
    disabledAccountCount: 1,
    recentEditCount: 4
  };

  assert.equal(workspaceSummary(overview, 'admin'), '3 pessoas · 1 convite pendente');
  assert.equal(workspaceSummary(overview, 'collaborator'), '3 pessoas');
  assert.equal(integrationsSummary(overview), '2 contas disponíveis · 1 desativada');
  assert.equal(historySummary(overview), '4 alterações nas últimas 24 h');
});

test('resumos do popup tratam singular, vazio e indisponibilidade', () => {
  assert.equal(workspaceSummary({ memberCount: 1, pendingInvitationCount: 2 }, 'admin'), '1 pessoa · 2 convites pendentes');
  assert.equal(integrationsSummary({ accountCount: 1, disabledAccountCount: 0 }), '1 conta disponível');
  assert.equal(integrationsSummary({ accountCount: 0 }), 'Nenhuma conta disponível');
  assert.equal(historySummary({ recentEditCount: 1 }), '1 alteração nas últimas 24 h');
  assert.equal(historySummary({ recentEditCount: 0 }), 'Nenhuma alteração nas últimas 24 h');
  assert.equal(workspaceSummary(null, 'admin'), 'Pessoas, convites e acesso às contas');
  assert.equal(integrationsSummary(null), 'Contas conectadas e acesso ao Mercado Livre');
  assert.equal(historySummary(null), 'Alterações confirmadas nos anúncios');
});

test('estado retomavel do popup persiste somente dados nao sensiveis na sessao', async () => {
  const originalChrome = globalThis.chrome;
  let stored = null;
  globalThis.chrome = {
    runtime: { lastError: null },
    storage: { session: {
      get(defaults, callback) { callback({ ...defaults, [POPUP_SESSION_STATE_KEY]: stored }); },
      set(values, callback) { stored = values[POPUP_SESSION_STATE_KEY]; callback(); },
      remove(_key, callback) { stored = null; callback(); }
    } }
  } as typeof chrome;

  try {
    const raw = {
      view: 'workspace',
      auth: { mode: 'magic', phase: 'code', name: 'Mateus', email: 'mateus@example.com', cooldownUntil: 123456, password: 'segredo', confirmation: 'segredo', code: '654321' },
      workspace: { workspaceId: 'workspace-1', inviteOpen: true, inviteDraft: { kind: 'email', email: 'pessoa@example.com', role: 'collaborator', accountIds: ['account-1'], token: 'secreto' } },
      integrations: { mode: 'cards' }
    };

    await writePopupSessionState(raw);
    const restored = await readPopupSessionState();
    assert.deepEqual(restored, normalizePopupSessionState(raw));
    assert.equal(restored.view, 'workspace');
    assert.equal(restored.auth?.phase, 'code');
    assert.equal(restored.workspace?.inviteDraft.email, 'pessoa@example.com');
    assert.equal(restored.integrations.mode, 'cards');
    assert.doesNotMatch(JSON.stringify(stored), /segredo|654321|secreto/);

    const legacySignup = normalizePopupSessionState({ auth: { mode: 'signup', phase: 'details', email: 'mateus@example.com' } });
    assert.equal(legacySignup.auth?.phase, 'email');

    await clearPopupSessionState();
    assert.equal(stored, null);
  } finally {
    globalThis.chrome = originalChrome;
  }
});
