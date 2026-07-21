import { describe, expect, it, vi } from "vitest";
import {
    buildFlowRequest, generateNumericOtp, interpretResponse, sendOtpSms, toMsg91Mobile,
} from "../src/modules/auth/msg91";

const cfg = {
    authKey: "AK",
    templateId: "TID",
    senderId: "NRFLT",
    otpVar: "otp",
    baseUrl: "https://control.msg91.com",
};

describe("toMsg91Mobile", () => {
    it("strips +, spaces and separators to digits only", () => {
        expect(toMsg91Mobile("+91 98765-43210")).toBe("919876543210");
        expect(toMsg91Mobile("(91) 9876 543210")).toBe("919876543210");
    });
    it("handles empty/nullish input", () => {
        expect(toMsg91Mobile("")).toBe("");
        expect(toMsg91Mobile(undefined as unknown as string)).toBe("");
    });
});

describe("buildFlowRequest", () => {
    it("maps phone + otp into a Flow API recipient using the configured var", () => {
        const body = buildFlowRequest(cfg, { phone: "+919876543210", otp: "123456" });
        expect(body).toMatchObject({
            template_id: "TID",
            sender: "NRFLT",
            recipients: [{ mobiles: "919876543210", otp: "123456" }],
        });
    });

    it("uses a custom otp variable name", () => {
        const body = buildFlowRequest({ ...cfg, otpVar: "var1" }, { phone: "919876543210", otp: "0000" });
        expect(body.recipients).toEqual([{ mobiles: "919876543210", var1: "0000" }]);
    });

    it("omits sender when not configured", () => {
        const body = buildFlowRequest({ ...cfg, senderId: undefined }, { phone: "919876543210", otp: "1" });
        expect(body).not.toHaveProperty("sender");
    });
});

describe("interpretResponse", () => {
    it("treats type=success as ok", () => {
        expect(interpretResponse(200, { type: "success", message: "req-1" })).toEqual({
            ok: true, status: 200, providerMessage: "req-1",
        });
    });
    it("treats a 2xx with no type as ok", () => {
        expect(interpretResponse(200, { message: "3f2..." }).ok).toBe(true);
    });
    it("treats type=error as failure even on 200", () => {
        const r = interpretResponse(200, { type: "error", message: "bad template" });
        expect(r.ok).toBe(false);
        expect(r.providerMessage).toBe("bad template");
    });
    it("treats non-2xx as failure", () => {
        expect(interpretResponse(401, { message: "unauthorized" }).ok).toBe(false);
    });
});

describe("sendOtpSms", () => {
    it("POSTs to the Flow endpoint with the authkey header and returns the parsed result", async () => {
        const fetchImpl = vi.fn().mockResolvedValue({
            status: 200,
            json: async () => ({ type: "success", message: "req-99" }),
        });

        const result = await sendOtpSms(cfg, { phone: "+919876543210", otp: "654321" }, fetchImpl);

        expect(result).toEqual({ ok: true, status: 200, providerMessage: "req-99" });
        const [url, init] = fetchImpl.mock.calls[0];
        expect(url).toBe("https://control.msg91.com/api/v5/flow/");
        expect(init.method).toBe("POST");
        expect(init.headers.authkey).toBe("AK");
        expect(JSON.parse(init.body).recipients[0]).toEqual({ mobiles: "919876543210", otp: "654321" });
    });

    it("surfaces a provider-level rejection as ok=false", async () => {
        const fetchImpl = vi.fn().mockResolvedValue({
            status: 400,
            json: async () => ({ type: "error", message: "invalid authkey" }),
        });
        const result = await sendOtpSms(cfg, { phone: "919876543210", otp: "1" }, fetchImpl);
        expect(result.ok).toBe(false);
        expect(result.providerMessage).toBe("invalid authkey");
    });

    it("throws when credentials are missing", async () => {
        await expect(
            sendOtpSms({ authKey: "", templateId: "" }, { phone: "9", otp: "1" }, vi.fn()),
        ).rejects.toThrow(/not configured/i);
    });
});

describe("generateNumericOtp", () => {
    it("produces a numeric string of the requested length", () => {
        const otp = generateNumericOtp(6);
        expect(otp).toMatch(/^\d{6}$/);
        expect(generateNumericOtp(4)).toMatch(/^\d{4}$/);
    });
});
