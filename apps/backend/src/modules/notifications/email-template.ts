export interface EmailField {
    label: string;
    value: string;
}

export interface NotificationEmailInput {
    heading: string;
    introText: string;
    fields: EmailField[];
    ctaLabel: string;
    ctaUrl: string;
}

/**
 * One shared, inline-styled, email-client-safe layout for every event type —
 * differences are expressed via `fields`, not separate template files.
 */
export function renderNotificationEmail(input: NotificationEmailInput): string {
    const rows = input.fields
        .map(
            (f) => `
            <tr>
                <td style="padding:4px 0;color:#6b7280;font-size:14px;">${escapeHtml(f.label)}</td>
                <td style="padding:4px 0;color:#111827;font-size:14px;font-weight:600;text-align:right;">${escapeHtml(f.value)}</td>
            </tr>`,
        )
        .join("");

    return `<!doctype html>
<html>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6;padding:24px 0;">
        <tr>
            <td align="center">
                <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;">
                    <tr>
                        <td style="background-color:#0f172a;padding:20px 24px;">
                            <span style="color:#ffffff;font-size:18px;font-weight:700;">Swapngo</span>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:24px;">
                            <h1 style="margin:0 0 12px;font-size:20px;color:#111827;">${escapeHtml(input.heading)}</h1>
                            <p style="margin:0 0 16px;font-size:14px;line-height:1.5;color:#374151;">${escapeHtml(input.introText)}</p>
                            ${
                                rows
                                    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e5e7eb;margin-bottom:20px;">${rows}</table>`
                                    : ""
                            }
                            <a href="${input.ctaUrl}" style="display:inline-block;background-color:#0f172a;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:10px 20px;border-radius:6px;">${escapeHtml(input.ctaLabel)}</a>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:16px 24px;background-color:#f9fafb;">
                            <p style="margin:0;font-size:12px;color:#9ca3af;">This is an automated notification from Swapngo Admin.</p>
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
