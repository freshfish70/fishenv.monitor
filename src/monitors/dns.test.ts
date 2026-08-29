import { assertEquals } from "@std/assert";
import { checkDns, defaultDnsIsDown } from "./dns.ts";
import type { DnsMonitorConfig } from "../types/monitor.ts";

function withMockedResolveDns<T>(
  impl: typeof Deno.resolveDns,
  fn: () => Promise<T>,
): Promise<T> {
  const original = Deno.resolveDns;
  // deno-lint-ignore no-explicit-any
  (Deno as any).resolveDns = impl;
  return fn().finally(() => {
    Deno.resolveDns = original;
  });
}

const baseConfig: DnsMonitorConfig = {
  name: "test-dns",
  type: "dns",
  interval: 60,
  hostname: "example.com",
};

Deno.test("checkDns returns records on success", async () => {
  await withMockedResolveDns(
    // deno-lint-ignore no-explicit-any
    (() => Promise.resolve(["1.2.3.4"])) as any,
    async () => {
      const result = await checkDns(baseConfig, new AbortController().signal);
      assertEquals(result.records, ["1.2.3.4"]);
      assertEquals(result.error, undefined);
    },
  );
});

Deno.test("checkDns captures thrown errors as a result instead of throwing", async () => {
  await withMockedResolveDns(
    // deno-lint-ignore no-explicit-any
    (() => Promise.reject(new Error("NXDOMAIN"))) as any,
    async () => {
      const result = await checkDns(baseConfig, new AbortController().signal);
      assertEquals(result.records, null);
      assertEquals(result.error?.message, "NXDOMAIN");
    },
  );
});

Deno.test("defaultDnsIsDown is down when records is null", () => {
  const result = defaultDnsIsDown(baseConfig, { records: null, durationMs: 1 });
  assertEquals(result.down, true);
});

Deno.test("defaultDnsIsDown is down when zero records returned", () => {
  const result = defaultDnsIsDown(baseConfig, { records: [], durationMs: 1 });
  assertEquals(result.down, true);
});

Deno.test("defaultDnsIsDown is up when records exist", () => {
  const result = defaultDnsIsDown(baseConfig, {
    records: ["1.2.3.4"],
    durationMs: 1,
  });
  assertEquals(result.down, false);
});
