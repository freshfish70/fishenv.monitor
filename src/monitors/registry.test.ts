import { assertEquals } from "@std/assert";
import { check, resolveIsDown } from "./registry.ts";
import type { DnsMonitorConfig, HttpMonitorConfig } from "../types/monitor.ts";

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

const httpMonitor: HttpMonitorConfig = {
  name: "web",
  type: "http",
  interval: 30,
  url: "https://example.com",
};

const dnsMonitor: DnsMonitorConfig = {
  name: "dns",
  type: "dns",
  interval: 30,
  hostname: "example.com",
};

Deno.test("check() dispatches http monitors to checkHttp", async () => {
  await withMockedFetch(
    () => Promise.resolve(new Response("ok", { status: 200 })),
    async () => {
      const result = await check(httpMonitor, new AbortController().signal);
      assertEquals("status" in result && result.status, 200);
    },
  );
});

Deno.test("resolveIsDown() uses the default when the monitor has no custom isDown", async () => {
  await withMockedFetch(
    () => Promise.resolve(new Response("err", { status: 500 })),
    async () => {
      const result = await check(httpMonitor, new AbortController().signal);
      const isDownResult = await resolveIsDown(httpMonitor, result);
      assertEquals(isDownResult.down, true);
    },
  );
});

Deno.test("resolveIsDown() uses the monitor's custom isDown when defined", async () => {
  const monitor: HttpMonitorConfig = {
    ...httpMonitor,
    isDown: (_config, result) => ({
      down: result.status === 999,
      message: "custom",
    }),
  };
  await withMockedFetch(
    () => Promise.resolve(new Response("ok", { status: 200 })),
    async () => {
      const result = await check(monitor, new AbortController().signal);
      const isDownResult = await resolveIsDown(monitor, result);
      assertEquals(isDownResult, { down: false, message: "custom" });
    },
  );
});

Deno.test("resolveIsDown() dispatches dns monitors correctly", async () => {
  const original = Deno.resolveDns;
  // deno-lint-ignore no-explicit-any
  (Deno as any).resolveDns = () => Promise.resolve([]);
  try {
    const result = await check(dnsMonitor, new AbortController().signal);
    const isDownResult = await resolveIsDown(dnsMonitor, result);
    assertEquals(isDownResult.down, true); // zero records => down
  } finally {
    Deno.resolveDns = original;
  }
});
