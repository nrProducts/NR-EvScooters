/** Swapngo's real support / office details. */
export const CONTACT_EMAIL = "contact@swapngo.in";
export const CONTACT_IS_PLACEHOLDER = false;

export const CONTACT_ADDRESS = "No. 5/61, Pillaiyar Kovil Street, Medavakkam, Chennai - 600100";

/** Real and DB-backed: the initial battery-swap network is Chennai-only. */
export const SERVICE_CITY = "Chennai";

/** The support number — shown in the header's top bar, the Contact section, and the footer. */
export const CONTACT_PHONES: { display: string; href: string }[] = [
  { display: "+91 96009 99046", href: "tel:+919600999046" },
];

/** WhatsApp is still a placeholder — "#" so it's obviously a stand-in rather than a link that looks real but goes nowhere useful. */
export const WHATSAPP_URL = "#";
export const INSTAGRAM_URL = "https://www.instagram.com/swapngo.in/";

export const SOCIAL_LINKS: { label: string; url: string }[] = [
  { label: "Instagram", url: INSTAGRAM_URL },
];
