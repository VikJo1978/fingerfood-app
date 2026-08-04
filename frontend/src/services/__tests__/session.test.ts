import { describe, expect, it, vi, afterEach } from "vitest";
import {
  clearCsrfToken,
  fetchUiSession,
  getCsrfToken,
  sessionStatusMessage,
} from "../session";

describe("fetchUiSession", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    clearCsrfToken();
  });

  it("stores csrf token in memory for authenticated employee mode", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          employee_auth_mode: "employee",
          authenticated: true,
          application_access_allowed: true,
          principal: {
            account_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            username: "super.admin",
            display_name: "Super Admin",
            role: "SUPERADMIN",
          },
          csrf_token: "csrf-test-token",
        })
      )
    );

    const result = await fetchUiSession();
    expect(result.status).toBe("authenticated");
    expect(getCsrfToken()).toBe("csrf-test-token");
  });

  it("does not store employee session token", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          employee_auth_mode: "employee",
          authenticated: false,
          application_access_allowed: false,
          principal: null,
          csrf_token: null,
        })
      )
    );

    await fetchUiSession();
    expect(getCsrfToken()).toBeNull();
  });

  it("maps unavailable Core auth to a stable status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("upstream down", { status: 503 }))
    );

    const result = await fetchUiSession();
    expect(result.status).toBe("unavailable");
    expect(sessionStatusMessage(result.status)).toContain("nicht erreichbar");
  });

  it("clears stale csrf on 401-style unauthenticated responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          employee_auth_mode: "employee",
          authenticated: true,
          application_access_allowed: true,
          principal: {
            account_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            username: "super.admin",
            display_name: "Super Admin",
            role: "SUPERADMIN",
          },
          csrf_token: "csrf-test-token",
        })
      )
    );
    await fetchUiSession();
    expect(getCsrfToken()).toBe("csrf-test-token");

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          employee_auth_mode: "employee",
          authenticated: false,
          application_access_allowed: false,
          principal: null,
          csrf_token: null,
        })
      )
    );
    const result = await fetchUiSession();
    expect(result.status).toBe("not_authenticated");
    expect(getCsrfToken()).toBeNull();
  });

  it("clears stale csrf on 503 responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          employee_auth_mode: "employee",
          authenticated: true,
          application_access_allowed: true,
          principal: {
            account_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            username: "super.admin",
            display_name: "Super Admin",
            role: "SUPERADMIN",
          },
          csrf_token: "csrf-test-token",
        })
      )
    );
    await fetchUiSession();
    expect(getCsrfToken()).toBe("csrf-test-token");

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("upstream down", { status: 503 }))
    );
    const result = await fetchUiSession();
    expect(result.status).toBe("unavailable");
    expect(getCsrfToken()).toBeNull();
  });

  it("clears stale csrf on bootstrap network failures and reports unavailable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          employee_auth_mode: "employee",
          authenticated: true,
          application_access_allowed: true,
          principal: {
            account_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            username: "super.admin",
            display_name: "Super Admin",
            role: "SUPERADMIN",
          },
          csrf_token: "csrf-test-token",
        })
      )
    );
    await fetchUiSession();
    expect(getCsrfToken()).toBe("csrf-test-token");

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("network down");
      })
    );
    const result = await fetchUiSession();
    expect(result.status).toBe("unavailable");
    expect(result.state).toBeNull();
    expect(getCsrfToken()).toBeNull();
  });
});
