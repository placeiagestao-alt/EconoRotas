import { MessageCircle } from "lucide-react";

const SUPPORT_PHONE = "5518996531491";
const SUPPORT_MESSAGE =
  "Ola, preciso de suporte no EconoRota.";

export function FloatingWhatsApp() {
  const url = `https://wa.me/${SUPPORT_PHONE}?text=${encodeURIComponent(
    SUPPORT_MESSAGE
  )}`;

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] right-[calc(1rem+env(safe-area-inset-right))] z-50 inline-flex h-12 w-12 items-center justify-center gap-2 rounded-full bg-[#25D366] px-0 text-sm font-semibold text-white shadow-[0_12px_28px_rgb(15_23_42_/_22%)] transition-transform active:scale-[0.97] sm:w-auto sm:px-4 md:h-14 md:px-5"
      aria-label="Falar com suporte pelo WhatsApp"
      title="Suporte WhatsApp"
    >
      <MessageCircle className="h-6 w-6" />
      <span className="hidden sm:inline">Suporte</span>
    </a>
  );
}
