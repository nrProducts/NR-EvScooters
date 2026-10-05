import { z } from "zod";

const docTypeEnum = z.enum(["terms"]);
const languageEnum = z.enum(["en", "ta"]);

export const documentTypeParam = z.object({ type: docTypeEnum });

export const documentQuery = z.object({
    lang: languageEnum.default("en"),
});

/**
 * The client sends the version it was rendering, exactly as the consent
 * module does — and for the same reason. A rider must not be recorded as
 * accepting terms that were retired while the screen was open, because the
 * whole value of the record is that it names the words they actually saw.
 *
 * `language` is what they were shown, not their app-wide preference: if the
 * Tamil body is absent and they read the English fallback, that is what the
 * evidence must say.
 */
export const acceptDocumentBody = z
    .object({
        doc_type: docTypeEnum,
        version: z.string().trim().min(1, "The document version is required."),
        language: languageEnum.default("en"),
        device_id: z.string().trim().max(200).optional(),
    })
    .strict();

/**
 * Publishing retires the live document and re-prompts every rider, so this is
 * admin-only and deliberately not an "edit". A document a rider has already
 * accepted must never change under them — a correction is a new version.
 *
 * `body_ta` is optional here, unlike the consent notice's, because a legal
 * document must not be machine-translated and no reviewed Tamil text exists
 * yet. Omitting it serves the English body to every rider; see
 * getDocumentView.
 */
export const publishDocumentBody = z
    .object({
        doc_type: docTypeEnum,
        version: z
            .string()
            .trim()
            .regex(
                /^\d{4}-\d{2}-\d{2}\.\d+(-[a-z0-9]+)?$/,
                "Use the format YYYY-MM-DD.N, optionally suffixed, e.g. 2026-09-04.1 or 2026-09-04.1-draft",
            ),
        body_en: z.string().trim().min(500, "The terms look too short to be complete."),
        body_ta: z.string().trim().min(500).optional(),
        effective_from: z.string().datetime().optional(),
    })
    .strict();

export const userIdParam = z.object({
    userId: z.string().uuid("A valid user id is required."),
});

export type AcceptDocumentBody = z.infer<typeof acceptDocumentBody>;
export type PublishDocumentBody = z.infer<typeof publishDocumentBody>;
