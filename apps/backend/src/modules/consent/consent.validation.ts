import { z } from "zod";
import { ALL_PURPOSES } from "./consent.purposes";

const purposeEnum = z.enum(ALL_PURPOSES as unknown as [string, ...string[]]);
const languageEnum = z.enum(["en", "ta"]);

export const noticeQuery = z.object({
    lang: languageEnum.default("en"),
});

export const purposeParam = z.object({ purpose: purposeEnum });

/**
 * The client sends its full view of the toggles plus the notice version it was
 * rendering. Sending the version is what makes the stale-notice check possible:
 * a rider must not be able to accept a notice that was retired while the screen
 * was open.
 */
export const recordConsentBody = z
    .object({
        notice_version: z.string().trim().min(1, "The notice version is required."),
        language: languageEnum.default("en"),
        device_id: z.string().trim().max(200).optional(),
        grants: z
            .array(
                z.object({
                    purpose: purposeEnum,
                    granted: z.boolean(),
                }),
            )
            .min(1, "Send at least one purpose.")
            .max(ALL_PURPOSES.length)
            .refine(
                (list) => new Set(list.map((g) => g.purpose)).size === list.length,
                "Each purpose may appear only once.",
            ),
    })
    .strict();

export const userIdParam = z.object({
    userId: z.string().uuid("A valid user id is required."),
});

/**
 * Publishing a notice retires the live one and re-prompts every rider, so this
 * is deliberately admin-only and deliberately not an "edit". A notice a rider
 * has already consented against must never change under them.
 */
export const publishNoticeBody = z
    .object({
        version: z
            .string()
            .trim()
            .regex(/^\d{4}-\d{2}-\d{2}\.\d+$/, "Use the format YYYY-MM-DD.N, e.g. 2026-08-14.1"),
        body_en: z.string().trim().min(200, "The English notice looks too short to be complete."),
        body_ta: z.string().trim().min(200, "The Tamil notice looks too short to be complete."),
        effective_from: z.string().datetime().optional(),
    })
    .strict();

export type RecordConsentBody = z.infer<typeof recordConsentBody>;
export type PublishNoticeBody = z.infer<typeof publishNoticeBody>;
