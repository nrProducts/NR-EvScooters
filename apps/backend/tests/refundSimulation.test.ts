import { afterEach, describe, expect, it, vi } from "vitest";
import { describeGatewayError, resolveRefundSimulation } from "../src/config/razorpay";
import { env } from "../src/config/env";

/**
 * `env` is a plain frozen-by-convention object built once at import, so the
 * guard rails are exercised by writing to it directly and restoring after —
 * the alternative (re-importing the module per case with a mutated
 * process.env) tests module caching rather than the rules themselves.
 */
const original = {
    mode: env.refundSimulationMode,
    nodeEnv: env.nodeEnv,
    keyId: env.razorpayKeyId,
};

afterEach(() => {
    env.refundSimulationMode = original.mode;
    env.nodeEnv = original.nodeEnv;
    env.razorpayKeyId = original.keyId;
    vi.restoreAllMocks();
});

function withEnv(mode: string, nodeEnv = "development", keyId = "rzp_test_abc") {
    env.refundSimulationMode = mode;
    env.nodeEnv = nodeEnv;
    env.razorpayKeyId = keyId;
    // The resolver logs loudly on every refusal; silence it so a passing run
    // is not full of red herrings.
    vi.spyOn(console, "error").mockImplementation(() => { });
    vi.spyOn(console, "warn").mockImplementation(() => { });
}

describe("resolveRefundSimulation", () => {
    it("is off by default", () => {
        withEnv("off");
        expect(resolveRefundSimulation()).toBe("off");
        withEnv("");
        expect(resolveRefundSimulation()).toBe("off");
    });

    it("accepts the three simulated outcomes on a test key in development", () => {
        for (const mode of ["success", "processing", "fail"] as const) {
            withEnv(mode);
            expect(resolveRefundSimulation()).toBe(mode);
        }
        withEnv("SUCCESS");
        expect(resolveRefundSimulation()).toBe("success");
    });

    it("REFUSES to simulate in production", () => {
        // The whole reason the previous mock branch was deleted: a
        // misconfigured production deploy must never fake a payout.
        withEnv("success", "production");
        expect(resolveRefundSimulation()).toBe("off");
    });

    it("REFUSES to simulate against a live key, whatever NODE_ENV claims", () => {
        withEnv("success", "development", "rzp_live_abc");
        expect(resolveRefundSimulation()).toBe("off");
    });

    it("treats an unrecognised value as off rather than as a mode", () => {
        withEnv("yes");
        expect(resolveRefundSimulation()).toBe("off");
    });
});

describe("describeGatewayError", () => {
    it("reads the Razorpay SDK's plain-object rejection", () => {
        // The exact shape that produced "[object Object]" in failure_reason.
        const err = {
            statusCode: 400,
            error: {
                code: "BAD_REQUEST_ERROR",
                description: "The amount is greater than the amount refundable.",
                reason: "input_validation_failed",
            },
        };
        const message = describeGatewayError(err);
        expect(message).toContain("The amount is greater than the amount refundable.");
        expect(message).toContain("BAD_REQUEST_ERROR");
        expect(message).toContain("400");
        expect(message).not.toContain("[object Object]");
    });

    it("falls back to an Error's message", () => {
        expect(describeGatewayError(new Error("socket hang up"))).toBe("socket hang up");
    });

    it("never returns [object Object] for an unrecognised object", () => {
        expect(describeGatewayError({ weird: true })).not.toContain("[object Object]");
    });

    it("survives a value that cannot be stringified", () => {
        const circular: Record<string, unknown> = {};
        circular.self = circular;
        expect(() => describeGatewayError(circular)).not.toThrow();
    });
});
