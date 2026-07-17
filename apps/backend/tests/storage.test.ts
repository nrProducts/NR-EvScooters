import { describe, expect, it } from "vitest";
import {
    assertValidFile, buildStoragePath, detectMime, pathBelongsToUser, UploadedFile,
} from "../src/modules/kyc/kyc.storage";
import { AppError } from "../src/common/AppError";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01]);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(10)]);
const PDF = Buffer.concat([Buffer.from("%PDF-"), Buffer.alloc(10)]);
const GIF = Buffer.concat([Buffer.from("GIF89a"), Buffer.alloc(10)]);

const file = (buffer: Buffer, mimetype: string, size = buffer.length): UploadedFile => ({
    buffer, mimetype, size, originalname: "doc",
});

describe("detectMime", () => {
    it("recognises the allowed types by magic number", () => {
        expect(detectMime(PNG)).toBe("image/png");
        expect(detectMime(JPEG)).toBe("image/jpeg");
        expect(detectMime(PDF)).toBe("application/pdf");
    });

    it("returns null for anything else", () => {
        expect(detectMime(GIF)).toBeNull();
    });
});

describe("assertValidFile", () => {
    it("accepts a well-formed PNG", () => {
        expect(assertValidFile(file(PNG, "image/png"), "front")).toBe("image/png");
    });

    it("rejects an unsupported type", () => {
        expect(() => assertValidFile(file(GIF, "image/gif"), "front")).toThrow(AppError);
    });

    it("rejects a file whose bytes contradict its declared type", () => {
        // A PDF renamed to .png and sent as image/png: the bytes are a
        // recognised type, just not the one claimed.
        expect(() => assertValidFile(file(PDF, "image/png"), "front")).toThrow(/does not match/i);
    });

    it("rejects unrecognised bytes even when the declared type is allowed", () => {
        // A GIF sent as image/png: no allowed signature matches at all.
        expect(() => assertValidFile(file(GIF, "image/png"), "front")).toThrow(/JPEG, PNG or PDF/i);
    });

    it("rejects an oversized file with 413", () => {
        try {
            assertValidFile(file(PNG, "image/png", 99 * 1024 * 1024), "front");
            expect.unreachable("should have thrown");
        } catch (err) {
            expect((err as AppError).status).toBe(413);
        }
    });

    it("rejects an empty file", () => {
        expect(() => assertValidFile(file(Buffer.alloc(0), "image/png", 0), "front")).toThrow(AppError);
    });
});

describe("buildStoragePath", () => {
    it("uses the {userId}/{docType}/{generated} layout", () => {
        const path = buildStoragePath("11111111-1111-1111-1111-111111111111", "national_id", "image/png", "front");
        expect(path).toMatch(/^11111111-1111-1111-1111-111111111111\/national_id\/front-[0-9a-f-]{36}\.png$/);
    });

    it("never reuses a name", () => {
        const a = buildStoragePath("u", "national_id", "image/png", "front");
        const b = buildStoragePath("u", "national_id", "image/png", "front");
        expect(a).not.toBe(b);
    });
});

describe("pathBelongsToUser", () => {
    it("accepts a path under the owner's prefix", () => {
        expect(pathBelongsToUser("user-a/national_id/front.png", "user-a")).toBe(true);
    });

    it("rejects another user's prefix", () => {
        expect(pathBelongsToUser("user-b/national_id/front.png", "user-a")).toBe(false);
    });
});
