export interface EmailField {
    label: string;
    value: string;
}

export interface NotificationEmailInput {
    heading: string;
    /** Lead paragraph, rendered directly under the heading. Omit to skip it. */
    introText?: string;
    fields: EmailField[];
    /**
     * Free-text block rendered AFTER the fields table, not before it —
     * for content that reads better as "here's who/what, then here's what
     * they said" (e.g. the website contact form's message) rather than as
     * the lead paragraph `introText` is for.
     */
    messageBlock?: { label: string; text: string };
    ctaLabel: string;
    ctaUrl: string;
}

/** The brand mark, hosted on the live website — the one absolute image URL every email client can fetch. */
const LOGO_URL = "https://swapngo.in/favicon.png";
/** hsl(142 71% 45%) — the one brand green shared across mobile, web and the website. Keep in sync by hand; see apps/mobile/src/constants/theme.ts. */
const BRAND_GREEN = "#21C45D";

/**
 * One shared, inline-styled, email-client-safe layout for every event type —
 * differences are expressed via `fields`, not separate template files.
 *
 * `color-scheme`/`supported-color-schemes` opt the message OUT of Gmail's and
 * Outlook's forced dark-mode remapping: without them, a client that "darkens"
 * unrecognised HTML mail inverted the navy header into pale lavender rather
 * than leaving it alone, which is what actually rendered badly. Every colour
 * below is also repeated as an attribute (`bgcolor`, `color`) alongside its
 * `style`, since Gmail's own sanitiser strips embedded `<style>` blocks and
 * some inline properties before this remapping pass ever runs.
 */
export function renderNotificationEmail(input: NotificationEmailInput): string {
    const rows = input.fields
        .map(
            (f) => `
            <tr>
                <td style="padding:6px 0;color:#6b7280;font-size:13px;">${escapeHtml(f.label)}</td>
                <td style="padding:6px 0;color:#111827;font-size:13px;font-weight:600;text-align:right;">${escapeHtml(f.value)}</td>
            </tr>`,
        )
        .join("");

    return `<!doctype html>
<html>
<head>
    <meta charset="utf-8" />
    <meta name="color-scheme" content="light" />
    <meta name="supported-color-schemes" content="light" />
</head>
<body style="margin:0;padding:0;background-color:#f1f5f4;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#f1f5f4" style="background-color:#f1f5f4;padding:32px 16px;">
        <tr>
            <td align="center">
                <table role="presentation" width="480" cellpadding="0" cellspacing="0" bgcolor="#ffffff" style="width:480px;max-width:100%;background-color:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
                    <tr>
                        <td bgcolor="#ffffff" style="background-color:#ffffff;padding:24px 28px;border-bottom:1px solid #f0f0f0;">
                            <table role="presentation" cellpadding="0" cellspacing="0">
                                <tr>
                                    <td style="padding-right:12px;">
                                        <img src="${LOGO_URL}" width="34" height="34" alt="SwapNgo" style="display:block;border-radius:8px;" />
                                    </td>
                                    <td>
                                        <span style="color:#111827;font-size:19px;font-weight:700;letter-spacing:-0.2px;">Swap<span style="color:${BRAND_GREEN};">Ngo</span></span>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    <tr>
                        <td bgcolor="#ffffff" style="background-color:#ffffff;padding:28px;">
                            <h1 style="margin:0 0 12px;font-size:19px;line-height:1.3;color:#111827;">${escapeHtml(input.heading)}</h1>
                            ${
                                input.introText
                                    ? `<p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#4b5563;">${escapeHtml(input.introText)}</p>`
                                    : ""
                            }
                            ${
                                rows
                                    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #eef0ef;margin-bottom:24px;">${rows}</table>`
                                    : ""
                            }
                            ${
                                input.messageBlock
                                    ? `<div style="margin-bottom:24px;">
                                <p style="margin:0 0 6px;font-size:13px;font-weight:600;color:#111827;">${escapeHtml(input.messageBlock.label)}</p>
                                <p style="margin:0;font-size:14px;line-height:1.6;color:#4b5563;white-space:pre-wrap;">${escapeHtml(input.messageBlock.text)}</p>
                            </div>`
                                    : ""
                            }
                            <table role="presentation" cellpadding="0" cellspacing="0">
                                <tr>
                                    <td bgcolor="${BRAND_GREEN}" style="background-color:${BRAND_GREEN};border-radius:8px;">
                                        <a href="${input.ctaUrl}" style="display:inline-block;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:11px 22px;">${escapeHtml(input.ctaLabel)}</a>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    <tr>
                        <td bgcolor="#fafbfa" style="padding:16px 28px;background-color:#fafbfa;border-top:1px solid #f0f0f0;">
                            <p style="margin:0;font-size:12px;color:#9ca3af;">This is an automated notification from SwapNgo.</p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>`;
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}
