import type { User } from "../drizzle/schema";
import * as db from "./db";

type AccessEmailTemplateName = "access_approved" | "access_waitlist";

type EmailSendResult = {
  status: "sent" | "skipped" | "failed";
  error?: string | null;
};

const APPROVAL_TEMPLATE = {
  subject: "Seu acesso ao EconoRotas foi aprovado",
  body: (name: string) => `Ola, ${name}.

Parabens! Seu acesso ao EconoRotas foi aprovado.

Agora voce ja pode entrar na plataforma, importar suas entregas e organizar suas rotas com mais controle e praticidade.

Estamos liberando os acessos por etapas para garantir estabilidade, suporte e uma boa experiencia para todos os usuarios.

Acesse sua conta pelo portal oficial do EconoRotas e comece a usar.

Bem-vindo ao EconoRotas.

Equipe EconoRotas`,
};

const WAITLIST_TEMPLATE = {
  subject: "Voce entrou na lista de espera do EconoRotas",
  body: (name: string) => `Ola, ${name}.

Recebemos seu cadastro no EconoRotas.

Neste momento, estamos liberando o acesso aos poucos para garantir estabilidade, suporte e uma boa experiencia durante a fase de testes.

Por isso, seu cadastro entrou na nossa lista de espera para novos testadores.

Assim que uma nova etapa de liberacao estiver disponivel, voce podera ser chamado para testar o EconoRotas.

Obrigado pelo interesse.

Equipe EconoRotas`,
};

function getAccessTemplate(templateName: AccessEmailTemplateName) {
  return templateName === "access_approved"
    ? APPROVAL_TEMPLATE
    : WAITLIST_TEMPLATE;
}

function getEmailFrom() {
  return (
    process.env.EMAIL_FROM?.trim() ||
    process.env.RESEND_FROM_EMAIL?.trim() ||
    "EconoRotas <no-reply@econorotas.com>"
  );
}

async function sendEmailMessage(input: {
  to: string;
  subject: string;
  text: string;
}): Promise<EmailSendResult> {
  const resendApiKey = process.env.RESEND_API_KEY?.trim();
  const webhookUrl = process.env.EMAIL_WEBHOOK_URL?.trim();

  if (resendApiKey) {
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: getEmailFrom(),
          to: input.to,
          subject: input.subject,
          text: input.text,
        }),
      });
      if (!response.ok) {
        const payload = await response.text().catch(() => "");
        return {
          status: "failed",
          error: `Resend ${response.status}: ${payload || response.statusText}`,
        };
      }
      return { status: "sent", error: null };
    } catch (error) {
      return {
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  if (webhookUrl) {
    try {
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          from: getEmailFrom(),
          ...input,
        }),
      });
      if (!response.ok) {
        return {
          status: "failed",
          error: `EMAIL_WEBHOOK_URL ${response.status}: ${response.statusText}`,
        };
      }
      return { status: "sent", error: null };
    } catch (error) {
      return {
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  return {
    status: "skipped",
    error: "Nenhum provedor de e-mail configurado.",
  };
}

export async function sendAccessReviewEmail(
  user: Pick<User, "id" | "name" | "email">,
  templateName: AccessEmailTemplateName
) {
  if (!user.email) {
    return db.createEmailLog({
      userId: user.id,
      email: "",
      templateName,
      status: "skipped",
      error: "Usuario sem e-mail.",
    });
  }

  const template = getAccessTemplate(templateName);
  const name = user.name?.trim() || "motorista";
  const result = await sendEmailMessage({
    to: user.email,
    subject: template.subject,
    text: template.body(name),
  });

  return db.createEmailLog({
    userId: user.id,
    email: user.email,
    templateName,
    status: result.status,
    error: result.error ?? null,
  });
}
