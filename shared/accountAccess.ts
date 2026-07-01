export const ACCOUNT_STATUSES = [
  "pending_review",
  "approved",
  "waitlist",
  "blocked",
  "suspended",
] as const;

export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

export const ACTIVE_ACCOUNT_STATUS: AccountStatus = "approved";

export function isApprovedAccountStatus(status: string | null | undefined) {
  return !status || status === ACTIVE_ACCOUNT_STATUS;
}

export function accountStatusLabel(status: string | null | undefined) {
  switch (status) {
    case "pending_review":
      return "Cadastro em analise";
    case "approved":
      return "Aprovado";
    case "waitlist":
      return "Lista de espera";
    case "blocked":
      return "Bloqueado";
    case "suspended":
      return "Suspenso";
    default:
      return "Aprovado";
  }
}
