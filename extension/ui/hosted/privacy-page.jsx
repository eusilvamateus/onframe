import { useEffect, useState } from 'react';
import { Link, Ph, Select } from '@onblide/ui';

const PRIVACY_SECTIONS = [
  { id: 'dados-tratados', title: 'Dados tratados' },
  { id: 'finalidades-e-armazenamento', title: 'Finalidades e armazenamento' },
  { id: 'compartilhamento-necessario', title: 'Compartilhamento necessário' },
  { id: 'conservacao-e-controle', title: 'Conservação e controle' },
  { id: 'seus-direitos-e-contato', title: 'Seus direitos e contato' },
  { id: 'uso-limitado', title: 'Uso limitado' }
];

function PolicySection({ number, id, title, children }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`}>
        <span aria-hidden="true">{number}.</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

export function PrivacyPage() {
  const [activeSection, setActiveSection] = useState(PRIVACY_SECTIONS[0].id);

  useEffect(() => {
    const updateActiveSection = () => {
      const current = PRIVACY_SECTIONS.reduce((active, section) => {
        const element = document.getElementById(section.id);
        return element && element.getBoundingClientRect().top <= 144 ? section.id : active;
      }, PRIVACY_SECTIONS[0].id);
      setActiveSection(current);
    };
    updateActiveSection();
    window.addEventListener('scroll', updateActiveSection, { passive: true });
    window.addEventListener('resize', updateActiveSection);
    return () => {
      window.removeEventListener('scroll', updateActiveSection);
      window.removeEventListener('resize', updateActiveSection);
    };
  }, []);

  return (
    <article className="onframe-hosted-policy">
      <header className="onframe-hosted-policy-intro">
        <h1>Política de privacidade do onframe</h1>
        <p>
          O onframe é uma extensão da onblide para gerenciar anúncios do Mercado Livre. Esta política explica quais
          dados usamos para oferecer o serviço, onde são processados e como você pode gerenciá-los.
        </p>
        <p className="onframe-hosted-policy-date">
          <Ph n="calendar-blank" size={16} />
          Atualizada em 21 de novembro de 2026.
        </p>
      </header>

      <div className="onframe-hosted-policy-layout">
        <nav className="onframe-hosted-policy-nav" aria-label="Nesta página">
          <p>Nesta página</p>
          <ol>
            {PRIVACY_SECTIONS.map(({ id, title }, index) => (
              <li key={id}>
                <a href={`#${id}`} aria-current={activeSection === id ? 'location' : undefined}>
                  <span aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
                  {title}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="onframe-hosted-policy-mobile-nav">
          <Select
            size="md"
            ariaLabel="Ir para uma seção desta página"
            options={PRIVACY_SECTIONS.map(({ title }) => title)}
            value={PRIVACY_SECTIONS.find(({ id }) => id === activeSection)?.title}
            onChange={(title) => {
              const section = PRIVACY_SECTIONS.find((item) => item.title === title);
              if (section) window.location.hash = section.id;
            }}
          />
        </div>

        <div className="onframe-hosted-policy-content">
          <PolicySection number="1" {...PRIVACY_SECTIONS[0]}>
            <ul>
              <li>
                Dados da conta onframe: nome, e-mail, foto de perfil, credenciais de autenticação e informações de
                segurança da sessão.
              </li>
              <li>
                Dados do workspace: nome, logo, membros, convites, perfis de acesso, contas conectadas e histórico das
                operações.
              </li>
              <li>
                Dados das contas Mercado Livre autorizadas: identificadores, informações públicas da conta e credenciais
                de autorização necessárias para executar operações.
              </li>
              <li>
                Dados dos anúncios e produtos gerenciados: títulos, descrições, fotos, características, preços, custos,
                impostos, margens, estoque e promoções, conforme os recursos utilizados.
              </li>
              <li>
                Dados técnicos necessários à segurança e ao funcionamento, como identificadores de sessão e registros de
                falhas e operações.
              </li>
            </ul>
            <p>
              A extensão atua nas páginas do Mercado Livre declaradas no navegador. Ela usa os dados do anúncio exibido
              para mostrar ferramentas de edição e identificar o produto correspondente. Não acompanha o histórico geral
              de navegação nem usa esses dados para publicidade comportamental.
            </p>
          </PolicySection>

          <PolicySection number="2" {...PRIVACY_SECTIONS[1]}>
            <p>
              Usamos esses dados para autenticar sua conta, proteger o acesso, administrar workspaces, consultar e
              editar anúncios autorizados, calcular resultados comerciais e registrar ações necessárias ao funcionamento
              e à segurança do onframe. A extensão guarda localmente o identificador de sessão revogável e preferências
              como tema. As operações autenticadas passam pelo serviço onframe em onframe.onblide.com.
            </p>
            <p>
              As credenciais de autorização do Mercado Livre ficam cifradas no banco do serviço onframe e não são
              entregues à página do anúncio. Senhas e fatores de autenticação são processados pelo provedor de
              identidade, não guardados pelo onframe como texto. Fotos de perfil e logos enviados para a plataforma
              ficam em armazenamento público e podem ser acessados por quem tiver o endereço do arquivo.
            </p>
          </PolicySection>

          <PolicySection number="3" {...PRIVACY_SECTIONS[2]}>
            <p>Os dados são compartilhados apenas conforme a função de cada serviço:</p>
            <ul>
              <li>Mercado Livre: autorização da conta e consultas ou alterações de anúncios solicitadas no onframe.</li>
              <li>Supabase: autenticação, fatores de segurança e armazenamento das imagens de perfil e workspace.</li>
              <li>
                Cloudflare: hospedagem do serviço, banco de dados, proteção contra abuso e execução das operações.
              </li>
              <li>Resend: entrega dos e-mails transacionais de acesso e segurança.</li>
              <li>
                Membros do mesmo workspace: dados e ações permitidos pelo perfil e pelas contas atribuídas a cada
                pessoa.
              </li>
            </ul>
            <p>Não vendemos dados pessoais nem os usamos para anúncios personalizados.</p>
          </PolicySection>

          <PolicySection number="4" {...PRIVACY_SECTIONS[3]}>
            <p>
              Mantemos os dados enquanto a conta, o workspace ou a integração precisarem deles. Você pode desconectar
              contas do Mercado Livre, encerrar sessões e solicitar a exclusão da sua conta nas configurações do
              onframe. A exclusão pode exigir que outro administrador assuma um workspace compartilhado. Registros de
              operações que permanecem no workspace perdem a identificação pessoal da conta excluída. A conservação de
              registros técnicos dos provedores segue as políticas e configurações desses serviços.
            </p>
          </PolicySection>

          <PolicySection number="5" {...PRIVACY_SECTIONS[4]}>
            <p>
              Você pode consultar e corrigir seus dados no perfil, gerenciar integrações e solicitar acesso, informação
              ou exclusão de dados pessoais. Para dúvidas e solicitações de privacidade, escreva para{' '}
              <Link href="mailto:eu.silvamateus80@gmail.com">eu.silvamateus80@gmail.com</Link>.
            </p>
          </PolicySection>

          <PolicySection number="6" {...PRIVACY_SECTIONS[5]}>
            <p>
              O uso de informações obtidas pelas permissões da extensão segue a Política de Dados do Usuário da Chrome
              Web Store, inclusive os requisitos de Uso Limitado. Usamos essas informações somente para oferecer e
              melhorar as funções descritas aqui, sem venda de dados ou publicidade personalizada. O acesso humano a
              dados pessoais é restrito às situações permitidas pela política, como suporte solicitado, segurança e
              obrigações legais.
            </p>
          </PolicySection>
        </div>
      </div>
    </article>
  );
}
