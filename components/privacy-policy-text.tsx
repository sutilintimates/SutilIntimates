export function PrivacyPolicyText() {
  return (
    <div className="prose prose-sm dark:prose-invert max-w-none space-y-6">
      <p className="text-base text-muted-foreground">
        A Sutil Intimates respeita a privacidade das anunciantes e trata seus dados pessoais
        com cuidado e responsabilidade. Esta Política explica quais informações podem ser
        coletadas, para que são utilizadas e como são protegidas.
      </p>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">1. Dados coletados</h2>
        <p className="text-sm text-muted-foreground">
          Durante o cadastro, a contratação ou o uso dos serviços, podemos receber dados
          fornecidos pela anunciante, como nome, endereço de e-mail, CPF ou CNPJ, assim como
          quaisquer outras informações necessárias para identificação, apresentação dos anúncios
          e realização de cobranças e confirmação de pagamentos.
        </p>
        <p className="text-sm text-muted-foreground">
          Também podemos tratar registros relacionados ao cadastro, às cobranças e aos
          pagamentos, quando necessários para prestar o serviço e manter seu funcionamento.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">2. Como usamos os dados</h2>
        <p className="text-sm text-muted-foreground">Utilizamos os dados para:</p>
        <ul className="list-disc space-y-1 pl-6 text-sm text-muted-foreground">
          <li>Criar e administrar o cadastro da anunciante;</li>
          <li>Identificar cobranças e confirmar pagamentos;</li>
          <li>Prevenir erros, fraudes e uso indevido da plataforma;</li>
          <li>Cumprir obrigações legais e atender solicitações legítimas de autoridades.</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">3. Compartilhamento</h2>
        <p className="text-sm text-muted-foreground">
          Não comercializamos dados pessoais. Quando necessário para prestar o serviço, os
          dados podem ser compartilhados com fornecedores que apoiam atividades como
          processamento de pagamentos, hospedagem, comunicação ou funcionamento da plataforma,
          limitados ao necessário para essas finalidades. Também poderemos compartilhá-los
          quando houver obrigação legal ou solicitação válida de autoridade competente.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">4. Proteção e armazenamento</h2>
        <p className="text-sm text-muted-foreground">
          Adotamos medidas técnicas e administrativas destinadas a proteger os dados contra
          acesso não autorizado, perda, alteração ou divulgação indevida. Os dados são
          mantidos pelo período necessário às finalidades descritas nesta Política e ao
          cumprimento de obrigações legais, regulatórias ou contratuais.
        </p>
        <p className="text-sm text-muted-foreground">
          Nenhum sistema é completamente livre de riscos, mas a Sutil busca tratar os dados de
          forma segura e responsável.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">5. Direitos do titular</h2>
        <p className="text-sm text-muted-foreground">
          Nos termos da legislação aplicável, o titular pode solicitar informações sobre o
          tratamento de seus dados, acesso, correção, atualização ou, quando cabível, exclusão.
          Algumas informações poderão ser mantidas quando houver obrigação legal ou outra
          justificativa legítima para sua conservação.
        </p>
        <p className="text-sm text-muted-foreground">
          Para exercer seus direitos ou esclarecer dúvidas sobre esta Política, entre em
          contato pelo WhatsApp:{' '}
          <a
            href="https://wa.me/553133751686"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-primary hover:underline"
          >
            +55 31 3375-1686
          </a>
          .
        </p>
      </section>
    </div>
  );
}
