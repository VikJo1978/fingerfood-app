/**
 * Shared UUIDv4 generation with a compatibility fallback.
 *
 * `crypto.randomUUID()` is only exposed in secure contexts (HTTPS or
 * localhost). The production Tailscale deployment is served over plain
 * HTTP, so the browser withholds `randomUUID` entirely and calling it
 * throws `TypeError: crypto.randomUUID is not a function`. This module
 * gives every browser-side identifier generator one place to get a
 * canonical UUIDv4 that works in both contexts.
 */

export const CANONICAL_UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** Thrown only when secure random bytes are genuinely unavailable. */
export class UuidGenerationError extends Error {
  constructor() {
    super("uuid_generation_unavailable");
    this.name = "UuidGenerationError";
  }
}

function fromRandomBytes(cryptoObj: Crypto): string {
  const bytes = new Uint8Array(16);
  cryptoObj.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10xx
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));
  return [
    hex.slice(0, 4).join(""),
    hex.slice(4, 6).join(""),
    hex.slice(6, 8).join(""),
    hex.slice(8, 10).join(""),
    hex.slice(10, 16).join(""),
  ].join("-");
}

/**
 * Returns a lowercase canonical UUIDv4. Prefers the native
 * `crypto.randomUUID()`; falls back to a `crypto.getRandomValues()`-based
 * implementation when it is unavailable. Never uses `Math.random()`.
 *
 * Throws `UuidGenerationError` only when neither `randomUUID` nor
 * `getRandomValues` exists, i.e. secure random bytes are genuinely
 * unavailable. Callers must not surface this error's raw message to the
 * user; catch it and show a fixed, translated message instead.
 */
export function generateUuidV4(): string {
  const cryptoObj = globalThis.crypto;
  if (typeof cryptoObj?.randomUUID === "function") {
    return cryptoObj.randomUUID();
  }
  if (typeof cryptoObj?.getRandomValues === "function") {
    return fromRandomBytes(cryptoObj);
  }
  throw new UuidGenerationError();
}
