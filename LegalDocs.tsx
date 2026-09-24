import React, { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { useLanguage } from "./i18n";

// Mesma data de LEGAL_VERSION em server/legal.mjs — é o que fica gravado na
// conta no aceite do cadastro. Ao mudar o texto de forma relevante, suba as
// duas juntas.
export const LEGAL_VERSION = "2026-09-24";
const VERSION_LABEL = "24 de setembro de 2026";

// PREENCHER antes de publicar: quem é o controlador dos dados (pessoa física
// ou empresa, com CPF/CNPJ se quiser) e o e-mail que atende pedidos de
// titulares (LGPD, art. 18) — precisa ser uma caixa lida de verdade.
const CONTROLLER = "[NOME DO RESPONSÁVEL OU EMPRESA]";
const CONTACT_EMAIL = "[privacidade@seudominio.com]";

// Os prazos daqui precisam bater com o código: retenção de eventos de login
// (server/retention.mjs), duração da sessão e dos links enviados por e-mail
// (server/auth.mjs), limite de denúncias (server/community.mjs).
export function PrivacyPolicy() {
  return (
    <div className="legal-doc">
      <p className="legal-version">Versão de {VERSION_LABEL}</p>
      <p>
        Esta política explica quais dados pessoais o Linkable trata, por quê,
        com quem eles são compartilhados, por quanto tempo ficam guardados e
        como você exerce seus direitos, conforme a Lei Geral de Proteção de
        Dados (Lei nº 13.709/2018 — LGPD).
      </p>

      <h3>1. Quem é o responsável</h3>
      <p>
        O controlador dos dados é {CONTROLLER}. Para qualquer assunto de
        privacidade, fale com a gente em <strong>{CONTACT_EMAIL}</strong>.
      </p>

      <h3>2. Quais dados tratamos</h3>
      <ul>
        <li>
          <strong>Dados da conta:</strong> e-mail, nome de usuário, nome de
          exibição, foto de perfil e capa (se você enviar), senha (guardada só
          como hash Argon2id, nunca em texto) e, se você vincular, o
          identificador da sua conta Google.
        </li>
        <li>
          <strong>Seu conteúdo:</strong> coleções, seções, agrupamentos e
          favoritos — nome, endereço (URL), descrição e a imagem ou ícone que
          buscamos no próprio site salvo.
        </li>
        <li>
          <strong>Interações na Comunidade:</strong> curtidas, itens salvos,
          compartilhamentos, comentários, quem você segue, quem você bloqueou e
          denúncias que você fez.
        </li>
        <li>
          <strong>Dados de segurança:</strong> endereço IP, navegador e
          data/hora de logins, tentativas de login, trocas de senha e eventos
          parecidos.
        </li>
        <li>
          <strong>No seu navegador:</strong> um cookie de sessão (necessário
          para manter você conectado) e, no armazenamento local, o idioma, o
          tema e quantas vezes você abriu cada favorito — isso fica só no seu
          dispositivo.
        </li>
        <li>
          <strong>Extensão do navegador:</strong> quando você abre a extensão
          para salvar uma página, ela lê o título, a descrição e a imagem da
          aba ativa. Ela não lê nada em segundo plano nem acompanha sua
          navegação.
        </li>
      </ul>

      <h3>3. Para que usamos e com qual base legal</h3>
      <ul>
        <li>
          <strong>Criar e manter sua conta e oferecer o serviço</strong>{" "}
          (guardar, organizar e exibir seus favoritos, enviar e-mails de
          confirmação e redefinição de senha) — execução de contrato (art. 7º,
          V).
        </li>
        <li>
          <strong>Funcionar a Comunidade</strong> (mostrar o que você
          publica, curtidas, comentários, seguidores) — execução de contrato.
        </li>
        <li>
          <strong>Segurança e prevenção de abuso</strong> (bloqueio após
          tentativas de login, limites de uso, verificação de senhas vazadas,
          moderação de denúncias) — legítimo interesse (art. 7º, IX) e
          prevenção à fraude.
        </li>
        <li>
          <strong>Verificar se seus links ainda funcionam</strong> — legítimo
          interesse, para avisar sobre favoritos quebrados.
        </li>
      </ul>
      <p>
        Não vendemos seus dados, não os usamos para publicidade e não
        montamos perfis para terceiros.
      </p>

      <h3>4. O que fica público</h3>
      <p>
        Tudo que você marcar como público fica visível para qualquer pessoa,
        inclusive quem não tem conta: seu perfil público (nome de exibição,
        usuário, foto, capa, data de entrada e número de seguidores), suas
        coleções públicas com os favoritos delas, e seus comentários na
        Comunidade. Coleções, seções e agrupamentos privados só são vistos por
        você.
      </p>

      <h3>5. Com quem compartilhamos</h3>
      <p>Só com os fornecedores necessários para o serviço funcionar:</p>
      <ul>
        <li>
          <strong>Render</strong> (EUA) — hospedagem do site e do banco de
          dados.
        </li>
        <li>
          <strong>Resend</strong> (EUA) — envio dos e-mails de confirmação e
          redefinição de senha (recebe seu e-mail e o conteúdo da mensagem).
        </li>
        <li>
          <strong>Google</strong> — só se você usar "Continuar com o Google",
          para confirmar sua identidade.
        </li>
        <li>
          <strong>Have I Been Pwned</strong> — para checar se uma senha nova
          já apareceu em vazamentos, enviamos só os 5 primeiros caracteres de
          um hash dela; a senha nunca sai do nosso servidor.
        </li>
      </ul>
      <p>
        Para buscar o nome e a imagem de um favorito e verificar se o link
        ainda funciona, o nosso servidor acessa o endereço salvo — o site vê
        o IP do servidor do Linkable, não o seu.
      </p>
      <p>
        Também podemos compartilhar dados quando a lei ou uma ordem judicial
        exigir.
      </p>

      <h3>6. Transferência internacional</h3>
      <p>
        Como a hospedagem e o envio de e-mails ficam nos Estados Unidos, seus
        dados são transferidos para fora do Brasil. Fazemos isso com
        fornecedores que adotam cláusulas contratuais e medidas de segurança
        compatíveis com a LGPD (art. 33).
      </p>

      <h3>7. Por quanto tempo guardamos</h3>
      <ul>
        <li>
          <strong>Conta e conteúdo:</strong> enquanto sua conta existir. Ao
          excluí-la, tudo é apagado na hora — coleções, favoritos,
          comentários, curtidas, seguidores e registros de login.
        </li>
        <li>
          <strong>Registros de login e segurança:</strong> 180 dias; depois
          são apagados automaticamente.
        </li>
        <li>
          <strong>Sessões:</strong> 30 dias, ou até você sair.
        </li>
        <li>
          <strong>Links de confirmação de e-mail e de redefinição de
          senha:</strong> valem 24 horas e 1 hora, respectivamente, e são
          apagados depois de vencidos.
        </li>
        <li>
          <strong>Cópias de segurança (backups):</strong> podem manter dados
          excluídos por um tempo limitado, até serem substituídas no ciclo
          normal.
        </li>
      </ul>

      <h3>8. Seus direitos</h3>
      <p>Pela LGPD (art. 18), você pode, a qualquer momento:</p>
      <ul>
        <li>confirmar se tratamos seus dados e acessá-los;</li>
        <li>corrigir dados incompletos ou desatualizados;</li>
        <li>
          receber uma cópia dos seus dados em formato aberto (portabilidade);
        </li>
        <li>pedir a exclusão dos seus dados;</li>
        <li>
          saber com quem compartilhamos e se opor a um tratamento baseado em
          legítimo interesse;
        </li>
        <li>revogar consentimentos que tenha dado.</li>
      </ul>
      <p>
        Na página <strong>Conta</strong> você mesmo edita seus dados, baixa
        uma cópia de tudo ("Baixar meus dados") e exclui a conta. Para
        qualquer outro pedido, escreva para {CONTACT_EMAIL} — respondemos em
        até 15 dias. Você também pode reclamar à Autoridade Nacional de
        Proteção de Dados (ANPD).
      </p>

      <h3>9. Segurança</h3>
      <p>
        Usamos conexão criptografada (HTTPS), senhas com hash Argon2id, cookie
        de sessão protegido (HttpOnly), bloqueio progressivo contra tentativas
        de adivinhar senha e acesso restrito ao banco de dados. Se acontecer
        um incidente de segurança que possa causar risco ou dano relevante,
        avisaremos você e a ANPD.
      </p>

      <h3>10. Crianças e adolescentes</h3>
      <p>
        O Linkable não é destinado a menores de 13 anos. Se você é
        responsável e acredita que uma criança criou uma conta, fale com a
        gente para que ela seja excluída.
      </p>

      <h3>11. Mudanças nesta política</h3>
      <p>
        Se mudarmos esta política de forma relevante, avisaremos no site
        antes da mudança valer. A data da versão fica sempre no topo.
      </p>
    </div>
  );
}

export function TermsOfUse() {
  return (
    <div className="legal-doc">
      <p className="legal-version">Versão de {VERSION_LABEL}</p>
      <p>
        Estes termos regem o uso do Linkable. Ao criar uma conta, você
        concorda com eles e com a Política de Privacidade.
      </p>

      <h3>1. O serviço</h3>
      <p>
        O Linkable permite guardar, organizar e compartilhar favoritos
        (links), em coleções privadas ou públicas, e participar de uma
        Comunidade onde as pessoas descobrem, curtem, salvam e comentam
        coleções umas das outras. Oferecemos também uma extensão de navegador
        para salvar páginas.
      </p>

      <h3>2. Sua conta</h3>
      <ul>
        <li>Você precisa ter pelo menos 13 anos para usar o Linkable.</li>
        <li>
          As informações do cadastro precisam ser verdadeiras, e você é
          responsável por manter sua senha em segurança e por tudo que
          acontecer na sua conta.
        </li>
        <li>
          Não é permitido se passar por outra pessoa ou criar contas para
          burlar um bloqueio ou suspensão.
        </li>
      </ul>

      <h3>3. Seu conteúdo</h3>
      <p>
        O que você salva e escreve continua sendo seu. Ao tornar algo público
        (uma coleção, seu perfil, um comentário), você autoriza o Linkable a
        exibir esse conteúdo para outras pessoas dentro do serviço, e outras
        pessoas podem salvá-lo nos itens salvos delas. Você pode tornar o
        conteúdo privado ou excluí-lo quando quiser.
      </p>
      <p>
        Você é responsável pelo que publica e declara ter o direito de
        compartilhar.
      </p>

      <h3>4. Regras da Comunidade</h3>
      <p>Não é permitido publicar ou compartilhar:</p>
      <ul>
        <li>conteúdo ilegal, ou links para conteúdo ilegal;</li>
        <li>
          discurso de ódio, assédio, ameaças ou exposição de dados pessoais de
          terceiros;
        </li>
        <li>
          conteúdo sexual envolvendo menores, em qualquer hipótese; e
          conteúdo adulto explícito em coleções públicas;
        </li>
        <li>
          links de phishing, malware, golpes ou qualquer coisa que engane ou
          prejudique quem clicar;
        </li>
        <li>spam, conteúdo automatizado em massa ou manipulação de curtidas;</li>
        <li>conteúdo que viole direitos autorais ou de marca de terceiros.</li>
      </ul>

      <h3>5. Moderação</h3>
      <p>
        Qualquer pessoa pode denunciar uma publicação ou comentário. Conteúdo
        com várias denúncias pode ser ocultado automaticamente até ser
        revisado. Podemos remover conteúdo que viole estes termos e, em casos
        graves ou repetidos, suspender ou encerrar a conta responsável.
      </p>

      <h3>6. Links de terceiros</h3>
      <p>
        Os favoritos apontam para sites de terceiros, que não controlamos. Não
        nos responsabilizamos pelo conteúdo, pela disponibilidade ou pelas
        práticas desses sites. O aviso de "link quebrado" é automático e pode
        errar.
      </p>

      <h3>7. Uso aceitável do serviço</h3>
      <p>
        Não tente acessar contas ou dados de outras pessoas, sobrecarregar o
        serviço, contornar limites de uso ou explorar falhas de segurança. Se
        encontrar uma falha, avise a gente em {CONTACT_EMAIL}.
      </p>

      <h3>8. Disponibilidade</h3>
      <p>
        Trabalhamos para manter o Linkable funcionando e seus dados seguros,
        mas o serviço é oferecido "no estado em que se encontra", pode ter
        interrupções e pode mudar ou ganhar e perder funcionalidades.
        Recomendamos exportar seus favoritos de vez em quando.
      </p>

      <h3>9. Responsabilidade</h3>
      <p>
        Na medida permitida pela lei, o Linkable não responde por danos
        indiretos decorrentes do uso do serviço ou de sites de terceiros.
        Nada nestes termos limita direitos que você tenha como consumidor
        pela lei brasileira.
      </p>

      <h3>10. Encerramento</h3>
      <p>
        Você pode excluir sua conta a qualquer momento na página Conta — seus
        dados são apagados como descrito na Política de Privacidade. Podemos
        encerrar contas que violem estes termos.
      </p>

      <h3>11. Mudanças nos termos</h3>
      <p>
        Se mudarmos estes termos de forma relevante, avisaremos no site antes
        da mudança valer. Continuar usando o Linkable depois disso significa
        aceitar a nova versão.
      </p>

      <h3>12. Lei aplicável</h3>
      <p>
        Estes termos seguem a lei brasileira. Fica eleito o foro do domicílio
        do usuário para resolver qualquer questão.
      </p>

      <h3>13. Contato</h3>
      <p>
        {CONTROLLER} — {CONTACT_EMAIL}
      </p>
    </div>
  );
}

export type LegalDocKind = "privacy" | "terms";

// Modal com um dos dois documentos — usado na tela de cadastro (links do
// aceite) e na página Conta.
export function LegalDialog({
  doc,
  onClose,
}: {
  doc: LegalDocKind | null;
  onClose: () => void;
}) {
  const { t } = useLanguage();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (doc && !ref.current?.open) ref.current?.showModal();
    else if (!doc && ref.current?.open) ref.current.close();
  }, [doc]);
  const title = doc === "terms" ? t("legal_terms") : t("legal_privacy");
  return (
    <dialog
      ref={ref}
      className="confirm-dialog legal-dialog"
      aria-labelledby="legal-dialog-title"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      {doc && (
        <div className="modal-content">
          <div className="modal-heading">
            <h2 id="legal-dialog-title">{title}</h2>
            <button
              className="icon-button"
              type="button"
              aria-label={t("legal_close")}
              onClick={onClose}
            >
              <X size={20} />
            </button>
          </div>
          {doc === "terms" ? <TermsOfUse /> : <PrivacyPolicy />}
        </div>
      )}
    </dialog>
  );
}
