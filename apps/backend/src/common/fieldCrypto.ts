import {
    createCipheriv,
    createDecipheriv,
    createHmac,
    randomBytes,
    timingSafeEqual,
} from "node:crypto";
import { env } from "../config/env";

/**
 * Application-level encryption for the one field the new schema keeps in full:
 * `kyc_documents.document_number`.
 *
 * The old schema stored only the last four digits. The new one keeps the whole
 * number, because a reviewer has to be able to compare what the rider typed
 * against the image, and because a duplicate-document check needs equality.
 * Neither is possible against a truncated value.
 *
 * Two columns therefore back one logical field:
 *
 *   `document_number_encrypted` — AES-256-GCM, reversible, read only by the
 *     KYC review path. Format is `v<version>.<iv>.<tag>.<ciphertext>`, all
 *     base64url, so a key rotation can be detected without a schema change.
 *
 *   `document_number_hmac` — HMAC-SHA256 blind index, deterministic, indexed.
 *     This is what equality queries hit. It is peppered with a *separate*
 *     secret so that leaking the search index does not leak the ability to
 *     decrypt, and vice versa.
 *
 * The pepper being distinct from the encryption key is the whole point of
 * having two secrets; do not collapse them.
 */

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12; // 96 bits — the size GCM is defined for
const KEY_VERSION = 1;

/** Thrown when a KYC crypto operation is attempted with no keys configured. */
class FieldCryptoUnconfigured extends Error {
    constructor(variable: string) {
        super(
            `${variable} is not configured. KYC document numbers cannot be ` +
                `encrypted or searched without it.`,
        );
        this.name = "FieldCryptoUnconfigured";
    }
}

/**
 * Decodes a secret that may be given as base64 or as raw text.
 *
 * Accepting both is deliberate: operators paste whatever `openssl rand` gave
 * them, and a 44-character base64 string and a 32-character passphrase are
 * both plausible things to find in a `.env`. What is *not* accepted is a key
 * that decodes to the wrong length — that fails loudly rather than being
 * silently padded into a weaker key.
 */
function keyMaterial(raw: string, variable: string, bytes: number): Buffer {
    if (!raw) throw new FieldCryptoUnconfigured(variable);

    const decoded = Buffer.from(raw, "base64");
    if (decoded.length === bytes) return decoded;

    const utf8 = Buffer.from(raw, "utf8");
    if (utf8.length === bytes) return utf8;

    throw new Error(
        `${variable} must decode to ${bytes} bytes (got ${decoded.length} from ` +
            `base64, ${utf8.length} as UTF-8). Generate one with: ` +
            `openssl rand -base64 ${bytes}`,
    );
}

// Resolved lazily so the app still boots in a dev environment with no keys set;
// only the KYC paths fail, and they fail with the message above.
let cachedKey: Buffer | null = null;
let cachedPepper: Buffer | null = null;

function encryptionKey(): Buffer {
    cachedKey ??= keyMaterial(env.kycEncryptionKey, "KYC_ENCRYPTION_KEY", 32);
    return cachedKey;
}

function hmacPepper(): Buffer {
    cachedPepper ??= keyMaterial(env.kycHmacPepper, "KYC_HMAC_PEPPER", 32);
    return cachedPepper;
}

/** Test seam — forces the next call to re-read `env`. */
export function resetFieldCryptoCache(): void {
    cachedKey = null;
    cachedPepper = null;
}

const b64u = (b: Buffer): string => b.toString("base64url");

/**
 * Encrypts a document number.
 *
 * A fresh random IV per call means the same number encrypts differently every
 * time — which is why equality has to go through {@link blindIndex} and can
 * never be done against this column.
 */
export function encryptField(plaintext: string): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, encryptionKey(), iv);
    const ciphertext = Buffer.concat([
        cipher.update(plaintext, "utf8"),
        cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return `v${KEY_VERSION}.${b64u(iv)}.${b64u(tag)}.${b64u(ciphertext)}`;
}

/**
 * Reverses {@link encryptField}.
 *
 * Throws on a tampered value rather than returning garbage: GCM's auth tag is
 * checked by `final()`, so a modified ciphertext or tag cannot be read at all.
 */
export function decryptField(encoded: string): string {
    const parts = encoded.split(".");
    if (parts.length !== 4 || !parts[0].startsWith("v")) {
        throw new Error("Malformed encrypted field: unrecognised envelope.");
    }

    const version = Number.parseInt(parts[0].slice(1), 10);
    if (version !== KEY_VERSION) {
        throw new Error(
            `Encrypted field was written with key version ${version}; this ` +
                `build only holds version ${KEY_VERSION}.`,
        );
    }

    const iv = Buffer.from(parts[1], "base64url");
    const tag = Buffer.from(parts[2], "base64url");
    const ciphertext = Buffer.from(parts[3], "base64url");

    const decipher = createDecipheriv(ALGORITHM, encryptionKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString(
        "utf8",
    );
}

/** The key version stamped into values this build writes. */
export const currentKeyVersion = KEY_VERSION;

/**
 * Deterministic search token for a document number.
 *
 * Callers must pass an already-normalised value (see `normaliseDocNumber`),
 * because "1234 5678 9012" and "123456789012" must produce the same index or
 * the duplicate check silently stops working.
 */
export function blindIndex(normalised: string): string {
    return createHmac("sha256", hmacPepper()).update(normalised, "utf8").digest("hex");
}

/** Constant-time comparison of two blind indexes. */
export function blindIndexMatches(a: string, b: string): boolean {
    const left = Buffer.from(a, "utf8");
    const right = Buffer.from(b, "utf8");
    if (left.length !== right.length) return false;
    return timingSafeEqual(left, right);
}
