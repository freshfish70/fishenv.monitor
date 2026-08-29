import { assertEquals } from "@std/assert";
import { checkHttp, defaultHttpIsDown } from "./http.ts";
import type { HttpMonitorConfig } from "../types/monitor.ts";

function withMockedFetch<T>(
  impl: typeof fetch,
  fn: () => Promise<T>,
): Promise<T> {
  const original = globalThis.fetch;
  globalThis.fetch = impl;
  return fn().finally(() => {
    globalThis.fetch = original;
  });
}

const baseConfig: HttpMonitorConfig = {
  name: "test",
  type: "http",
  interval: 30,
  url: "https://example.com",
};

Deno.test("checkHttp returns ok result for a 200 response", async () => {
  await withMockedFetch(
    () => Promise.resolve(new Response("ok", { status: 200 })),
    async () => {
      const result = await checkHttp(baseConfig, new AbortController().signal);
      assertEquals(result.status, 200);
      assertEquals(result.ok, true);
      assertEquals(result.error, undefined);
    },
  );
});

Deno.test("checkHttp captures thrown errors as a result instead of throwing", async () => {
  await withMockedFetch(
    () => Promise.reject(new TypeError("network down")),
    async () => {
      const result = await checkHttp(baseConfig, new AbortController().signal);
      assertEquals(result.status, 0);
      assertEquals(result.ok, false);
      assertEquals(result.error?.message, "network down");
    },
  );
});

Deno.test("checkHttp applies basic auth header", async () => {
  let seenAuth: string | null = null;
  await withMockedFetch(
    (_input, init) => {
      seenAuth = (init?.headers as Headers).get("Authorization");
      return Promise.resolve(new Response("ok", { status: 200 }));
    },
    async () => {
      await checkHttp(
        {
          ...baseConfig,
          auth: { type: "basic", username: "u", password: "p" },
        },
        new AbortController().signal,
      );
    },
  );
  assertEquals(seenAuth, `Basic ${btoa("u:p")}`);
});

Deno.test("checkHttp calls prepare() before issuing the request", async () => {
  let seenUrl: string | null = null;
  await withMockedFetch(
    (input) => {
      seenUrl = input.toString();
      return Promise.resolve(new Response("ok", { status: 200 }));
    },
    async () => {
      await checkHttp(
        {
          ...baseConfig,
          prepare: (config) => ({
            ...config,
            url: "https://prepared.example.com",
          }),
        },
        new AbortController().signal,
      );
    },
  );
  assertEquals(seenUrl, "https://prepared.example.com");
});

Deno.test("defaultHttpIsDown is down on non-2xx status", () => {
  const result = defaultHttpIsDown(baseConfig, {
    status: 500,
    ok: false,
    headers: new Headers(),
    durationMs: 1,
  });
  assertEquals(result.down, true);
});

Deno.test("defaultHttpIsDown is up on 2xx status", () => {
  const result = defaultHttpIsDown(baseConfig, {
    status: 204,
    ok: true,
    headers: new Headers(),
    durationMs: 1,
  });
  assertEquals(result.down, false);
});

Deno.test("defaultHttpIsDown is down on network error", () => {
  const result = defaultHttpIsDown(baseConfig, {
    status: 0,
    ok: false,
    headers: new Headers(),
    durationMs: 1,
    error: new Error("boom"),
  });
  assertEquals(result.down, true);
});
