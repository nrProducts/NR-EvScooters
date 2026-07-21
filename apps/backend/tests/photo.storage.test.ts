import { describe, expect, it } from "vitest";
import { assertValidPhoto, buildPhotoPath, photoPathBelongsToUser } from "../src/modules/users/users.photo.storage";
import { AppError } from "../src/common/AppError";
import type { UploadedFile } from "../src/modules/kyc/kyc.storage";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01]);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(10)]);
const PDF = Buffer.concat([Buffer.from("%PDF-"), Buffer.alloc(10)]);
const GIF = Buffer.concat([Buffer.from("GIF89a"), Buffer.alloc(10)]);

const file = (buffer: Buffer, mimetype: string, size = buffer.length): UploadedFile => ({
    buffer, mimetype, size, originalname: "photo",
});

describe("assertValidPhoto", () => {
    it("accepts a well-formed JPEG or PNG", () => {
        expect(assertValidPhoto(file(PNG, "image/png"))).toBe("image/png");
        expect(assertValidPhoto(file(JPEG, "image/jpeg"))).toBe("image/jpeg");
    });

    it("rejects a PDF, even though it's an allowed KYC document type", () => {
        expect(() => assertValidPhoto(file(PDF, "application/pdf"))).toThrow(AppError);
    });

    it("rejects unrecognised bytes", () => {
        expect(() => assertValidPhoto(file(GIF, "image/gif"))).toThrow(/JPEG or PNG/i);
    });

    it("rejects a mismatch between declared and actual type", () => {
        // Bytes are a valid photo type, just not the one the client claimed.
        expect(() => assertValidPhoto(file(PNG, "image/jpeg"))).toThrow(/does not match/i);
    });

    it("rejects an oversized photo with 413", () => {
        try {
            assertValidPhoto(file(PNG, "image/png", 99 * 1024 * 1024));
            expect.unreachable("should have thrown");
        } catch (err) {
            expect((err as AppError).status).toBe(413);
        }
    });

    it("rejects an empty file", () => {
        expect(() => assertValidPhoto(file(Buffer.alloc(0), "image/png", 0))).toThrow(AppError);
    });
});

describe("buildPhotoPath", () => {
    it("uses the {userId}/{generated} layout, with no doc-type segment", () => {
        const path = buildPhotoPath("11111111-1111-1111-1111-111111111111", "image/png");
        expect(path).toMatch(/^11111111-1111-1111-1111-111111111111\/[0-9a-f-]{36}\.png$/);
    });

    it("never reuses a name", () => {
        const a = buildPhotoPath("u", "image/png");
        const b = buildPhotoPath("u", "image/png");
        expect(a).not.toBe(b);
    });
});

describe("photoPathBelongsToUser", () => {
    it("accepts a path under the owner's prefix", () => {
        expect(photoPathBelongsToUser("user-a/photo.png", "user-a")).toBe(true);
    });

    it("rejects another user's prefix", () => {
        expect(photoPathBelongsToUser("user-b/photo.png", "user-a")).toBe(false);
    });
});
