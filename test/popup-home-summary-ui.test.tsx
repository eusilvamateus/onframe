import assert from 'node:assert/strict';
import test from 'node:test';
import { historySummary, integrationsSummary, workspaceSummary } from '../extension/ui/popup/summaries.js';

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
