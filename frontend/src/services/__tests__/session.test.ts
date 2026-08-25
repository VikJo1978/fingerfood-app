import { describe, expect, it, vi, afterEach } from "vitest";
import { clearCsrfToken, fetchUiSession, getCsrfToken, sessionStatusMessage } from "../session";

type FetchMock = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

describe("fetchUiSession", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    clearCsrfToken();
  });

  it("uses same-origin /api/ui/session when no API base is configured", async () => {
    vi.stubEnv("VITE_API_URL", "");
    vi.stubEnv("VITE_API_BASE_URL", "");
    const fetchMock = vi.fn<FetchMock>(async () => new Response("upstream down", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);

    await fetchUiSession();

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.lastCall?.[0]).toBe("/api/ui/session");
  });

  it("uses a configured API base URL without adding or removing path separators", async () => {
    vi.stubEnv("VITE_API_BASE_URL", "https://configurator.example.test");
    const fetchMock = vi.fn<FetchMock>(async () => new Response("upstream down", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);

    await fetchUiSession();

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.lastCall?.[0]).toBe("https://configurator.example.test/api/ui/session");
  });

  it("normalizes trailing slashes on a configured API base URL", async () => {
    vi.stubEnv("VITE_API_BASE_URL", "https://configurator.example.test///");
    const fetchMock = vi.fn<FetchMock>(async () => new Response("upstream down", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);

    await fetchUiSession();

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.lastCall?.[0]).toBe("https://configurator.example.test/api/ui/session");
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
