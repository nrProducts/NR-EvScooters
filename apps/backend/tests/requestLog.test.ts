import { describe, expect, it } from "vitest";
import { clientFromRequest } from "../src/common/requestLog";
import type { Request } from "express";

const reqWithHeader = (value: string | undefined): Request =>
    ({ header: (name: string) => (name === "x-client-app" ? value : undefined) }) as unknown as Request;

describe("clientFromRequest", () => {
    it("trusts a recognised X-Client-App header", () => {
        expect(clientFromRequest(reqWithHeader("mobile"))).toBe("mobile");
        expect(clientFromRequest(reqWithHeader("web"))).toBe("web");
        expect(clientFromRequest(reqWithHeader("website"))).toBe("website");
    });

    it("falls back to unknown for a missing or unrecognised header", () => {
        expect(clientFromRequest(reqWithHeader(undefined))).toBe("unknown");
        expect(clientFromRequest(reqWithHeader("curl"))).toBe("unknown");
        // Guards against a header value becoming the DB's free-text client
        // column verbatim — only the three real clients are ever trusted.
        expect(clientFromRequest(reqWithHeader("'; drop table users;--"))).toBe("unknown");
    });
});
