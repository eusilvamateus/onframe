import React from 'react';
import { Badge, List, ListItem, Ph } from '@onblide/ui';
import { SectionHeader } from '../shared/SectionHeader';

export function SecuritySettings({ profile, securityOverview, loading, onOpenSecurity, onOpenSessions, onOpenMfa, onOpenPasskeys }) {
  if (!profile) return null;
  const ready = Boolean(securityOverview);
  const sessions = ready ? securityOverview.sessions : null;
  const unavailable = loading ? 'Carregando...' : 'Indisponível';
  const navigation = (href, callback) => ({
    disabled: !ready || loading,
    href: ready ? href : undefined,
    onClick: (event) => { event.preventDefault(); if (ready && !loading) callback(); }
  });
  return (
    <div className="onframe-stack">
      <section className="onframe-stack" aria-label="Formas de entrar">
        <SectionHeader title="Formas de entrar" copy="Controle as credenciais usadas para acessar sua conta." />
        <List ariaLabel="Formas de entrar">
          <ListItem leading={<Ph n="key" size={20} />} title="Chaves de acesso" description="Entre com biometria ou o desbloqueio do dispositivo." meta={ready ? securityOverview.passkeys.length || undefined : unavailable} {...navigation('#settings-account-passkeys', onOpenPasskeys)} />
          <ListItem leading={<Ph n="password" size={18} />} title="Senha" description="Verifique seu e-mail antes de definir uma nova senha." {...navigation('#settings-account-password', () => onOpenSecurity('password'))} />
          <ListItem leading={<Ph n="envelope-simple" size={18} />} title="E-mail de acesso" description={profile.user.email} {...navigation('#settings-account-email', () => onOpenSecurity('email'))} />
        </List>
      </section>
      <section className="onframe-stack" aria-label="Proteção da conta">
        <SectionHeader title="Proteção da conta" />
        <List as="nav" dividers ariaLabel="Proteção da conta"><ListItem leading={<Ph n="shield-check" size={20} />} title="Verificação em duas etapas" description="Código de um aplicativo autenticador." meta={ready ? <Badge tone={securityOverview.factors.length ? 'green' : 'grey'}>{securityOverview.factors.length ? 'Ativada' : 'Não ativada'}</Badge> : unavailable} {...navigation('#settings-account-mfa', onOpenMfa)} /></List>
      </section>
      <section className="onframe-stack" aria-label="Sessões">
        <SectionHeader title="Sessões ativas" copy="Revogue navegadores que não precisam mais acessar sua conta." />
        <List as="nav" ariaLabel="Sessões ativas">
          <ListItem leading={<Ph n="browser" size={18} />} title="Navegadores autorizados"
            description={sessions ? sessions.length === 1 ? '1 sessão ativa na sua conta.' : `${sessions.length} sessões ativas na sua conta.` : 'Os dados de sessões ainda não foram carregados.'}
            meta={sessions ? sessions.length : unavailable} {...navigation('#sessoes-ativas', onOpenSessions)} />
        </List>
      </section>
    </div>
  );
}
