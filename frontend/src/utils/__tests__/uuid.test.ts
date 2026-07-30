/** generateUuidV4: production served over plain HTTP via Tailscale is not a
 * secure context, so `crypto.randomUUID` is withheld by the browser and
 * calling it throws `TypeError: crypto.randomUUID is not a function`. This
 * helper must transparently fall back to `crypto.getRandomValues()` without
 * ever using `Math.random()`. */
import { afterEach, describe, expect, it, vi } from "vitest";

import { CANONICAL_UUID_V4, UuidGenerationError, generateUuidV4 } from "../uuid";

const realGetRandomValues = globalThis.crypto.getRandomValues.bind(globalThis.crypto);

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("generateUuidV4", () => {
  it("uses the native crypto.randomUUID when available", () => {
    const native = "11111111-1111-4111-8111-111111111111";
    const randomUUID = vi.fn(() => native);
    vi.stubGlobal("crypto", { randomUUID, getRandomValues: realGetRandomValues });

    expect(generateUuidV4()).toBe(native);
    expect(randomUUID).toHaveBeenCalledTimes(1);
  });

  it("falls back to getRandomValues when crypto.randomUUID is undefined", () => {
    const getRandomValues = vi.fn((arr: Uint8Array) => realGetRandomValues(arr));
    vi.stubGlobal("crypto", { getRandomValues });

    const value = generateUuidV4();

    expect(getRandomValues).toHaveBeenCalledTimes(1);
    expect(CANONICAL_UUID_V4.test(value)).toBe(true);
  });

  it("falls back when crypto.randomUUID is present but not a function", () => {
    const getRandomValues = vi.fn((arr: Uint8Array) => realGetRandomValues(arr));
    vi.stubGlobal("crypto", { randomUUID: "not-a-function", getRandomValues });

    const value = generateUuidV4();

    expect(getRandomValues).toHaveBeenCalledTimes(1);
    expect(CANONICAL_UUID_V4.test(value)).toBe(true);
  });

  it("returns a lowercase canonical UUIDv4 from the fallback path", () => {
    vi.stubGlobal("crypto", { getRandomValues: realGetRandomValues });

    const value = generateUuidV4();

    expect(value).toBe(value.toLowerCase());
    expect(CANONICAL_UUID_V4.test(value)).toBe(true);
  });

  it("never calls Math.random on the native or the fallback path", () => {
    const mathRandomSpy = vi.spyOn(Math, "random");

    vi.stubGlobal("crypto", {
      randomUUID: () => "22222222-2222-4222-8222-222222222222",
      getRandomValues: realGetRandomValues,
    });
    generateUuidV4();

    vi.stubGlobal("crypto", { getRandomValues: realGetRandomValues });
    generateUuidV4();

    expect(mathRandomSpy).not.toHaveBeenCalled();
  });

  it("throws UuidGenerationError when neither randomUUID nor getRandomValues exists", () => {
    vi.stubGlobal("crypto", {});

    expect(() => generateUuidV4()).toThrow(UuidGenerationError);
  });

  it("throws UuidGenerationError when crypto itself is unavailable", () => {
    vi.stubGlobal("crypto", undefined);

    expect(() => generateUuidV4()).toThrow(UuidGenerationError);
  });

  it("generates distinct IDs on repeated calls", () => {
    vi.stubGlobal("crypto", { getRandomValues: realGetRandomValues });

    const first = generateUuidV4();
    const second = generateUuidV4();

    expect(first).not.toBe(second);
  });
});
