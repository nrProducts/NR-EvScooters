import { Router } from "express";
import { asyncHandler } from "../../common/asyncHandler";
import { validate } from "../../middleware/validate.middleware";
import { AppError } from "../../common/AppError";
import { clientIp, createRateLimiter } from "../../common/rateLimit";
import * as service from "./public.service";
import { submitContactQuery } from "./contact.service";
import { contactQueryBody, type ContactQueryBody } from "./public.validation";

/**
 * Unauthenticated endpoints for the public marketing site (apps/website).
 * Mounted at /public — no auth middleware, on purpose. Keep the reads PII-free
 * and cheap; the one write (POST /contact) is rate-limited below.
 */
const router = Router();

// A short CDN/browser cache — the marketing site does not need second-by-second
// freshness, and this shields the DB from crawler traffic.
//
// GET only: a cached POST response is never wanted, and an intermediary that
// honoured `s-maxage` on the contact endpoint could serve one visitor's
// submission result to another.
router.use((req, res, next) => {
    if (req.method === "GET") res.set("Cache-Control", "public, max-age=300, s-maxage=300");
    else res.set("Cache-Control", "no-store");
    next();
});

router.get("/plans", asyncHandler(async (_req, res) => {
    res.json({ plans: await service.getPublicPlans() });
}));

router.get("/stats", asyncHandler(async (_req, res) => {
    res.json(await service.getPublicStats());
}));

// --- Contact form -------------------------------------------------------
//
// Two limiters rather than one, because they stop different things. The IP
// window stops a single script hammering the endpoint; the email window stops
// the same address being used to flood the inbox from a rotating pool of
// addresses (a botnet), which the IP limit alone would miss. Both are
// deliberately generous enough that a person who mistypes their number three
// times and resubmits is never blocked.
const ipLimiter = createRateLimiter(5, 15 * 60 * 1000); // 5 per 15 min per IP
const emailLimiter = createRateLimiter(3, 60 * 60 * 1000); // 3 per hour per address

/**
 * 429. The two limiters get different wording because they mean different
 * things to the person reading it — "slow down" versus "we already have your
 * messages" — and a single generic line would leave the second case looking
 * like a fault.
 */
function tooManyRequests(message: string): AppError {
    return new AppError(429, message, "BUSINESS_RULE_VIOLATION");
}

router.post(
    "/contact",
    // The IP check runs BEFORE validation so a flood of malformed bodies costs
    // a map lookup rather than a full zod parse each.
    (req, res, next) => {
        const { allowed, retryAfterSeconds } = ipLimiter.check(clientIp(req));
        if (allowed) return next();
        res.set("Retry-After", String(retryAfterSeconds));
        next(
            tooManyRequests(
                "Too many submissions from this device. Please try again in a few minutes.",
            ),
        );
    },
    validate({ body: contactQueryBody }),
    asyncHandler(async (req, res) => {
        const body = req.body as ContactQueryBody;

        const perEmail = emailLimiter.check(`email:${body.email}`);
        if (!perEmail.allowed) {
            res.set("Retry-After", String(perEmail.retryAfterSeconds));
            throw tooManyRequests(
                "We have already received several messages from this address. Please try again later.",
            );
        }

        try {
            await submitContactQuery(body);
        } catch (err) {
            // Never surface the provider's own words: they name the ESP, can
            // quote the API key prefix, and tell a prober whether an address
            // exists. One generic 503 for "configured but failed" and "not
            // configured at all" alike — a visitor can act on neither.
            console.error("[public.contact] query submission failed", {
                queryType: body.query_type,
                error: err instanceof Error ? err.message : String(err),
            });
            throw new AppError(
                503,
                "Unable to submit your query right now. Please try again in a few minutes.",
                "SERVICE_UNAVAILABLE",
            );
        }

        res.status(202).json({
            submitted: true,
            message:
                "Thank you for contacting Swapngo! Your query has been submitted successfully. Our team will get back to you soon.",
        });
    }),
);

export default router;
