function count(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

function quantity(value, singular, plural) {
  const total = count(value);
  return `${total} ${total === 1 ? singular : plural}`;
}

export function workspaceSummary(overview, role) {
  if (!overview) return 'Pessoas, convites e acesso às contas';
  const parts = [quantity(overview.memberCount, 'pessoa', 'pessoas')];
  const pendingInvitations = count(overview.pendingInvitationCount);
  if (role === 'admin' && pendingInvitations > 0) {
    parts.push(quantity(pendingInvitations, 'convite pendente', 'convites pendentes'));
  }
  return parts.join(' · ');
}

export function integrationsSummary(overview) {
  if (!overview) return 'Contas conectadas e acesso ao Mercado Livre';
  const accountCount = count(overview.accountCount);
  if (accountCount === 0) return 'Nenhuma conta disponível';
  const parts = [quantity(accountCount, 'conta disponível', 'contas disponíveis')];
  const disabledAccounts = count(overview.disabledAccountCount);
  if (disabledAccounts > 0) {
    parts.push(quantity(disabledAccounts, 'desativada', 'desativadas'));
  }
  return parts.join(' · ');
}

export function historySummary(overview) {
  if (!overview) return 'Alterações confirmadas nos anúncios';
  const recentEdits = count(overview.recentEditCount);
  if (recentEdits === 0) return 'Nenhuma alteração nas últimas 24 h';
  return `${quantity(recentEdits, 'alteração', 'alterações')} nas últimas 24 h`;
}
