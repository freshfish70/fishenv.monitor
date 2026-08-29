import * as v from "valibot";

// Validates the plain-data shape of a dynamically-imported monitor config.
// This is the real safety net for user files: they sit outside Deno's static
// module graph, so `deno check` never type-checks them. Function-typed fields
// (`prepare`, `isDown`, `notify`) can only get a `typeof === "function"`
// guard here, not deep validation of their behavior.

const functionGuard = v.custom<(...args: never[]) => unknown>((value) =>
  typeof value === "function"
);

const notificationEndpointSchema = v.object({
  name: v.string(),
  type: v.string(),
  notify: functionGuard,
});

const baseFields = {
  id: v.pipe(v.string(), v.minLength(1)),
  name: v.pipe(v.string(), v.minLength(1)),
  interval: v.pipe(v.number(), v.minValue(1)),
  notification: v.optional(v.array(notificationEndpointSchema)),
  prepare: v.optional(functionGuard),
  isDown: v.optional(functionGuard),
};

const httpAuthSchema = v.union([
  v.object({
    type: v.literal("basic"),
    username: v.string(),
    password: v.string(),
  }),
  v.object({ type: v.literal("bearer"), token: v.string() }),
]);

function httpVariant(type: "http" | "https") {
  return v.object({
    ...baseFields,
    type: v.literal(type),
    url: v.pipe(v.string(), v.url()),
    method: v.optional(v.string()),
    headers: v.optional(v.record(v.string(), v.string())),
    body: v.optional(v.unknown()),
    auth: v.optional(httpAuthSchema),
    timeout: v.optional(v.number()),
  });
}

const dnsVariant = v.object({
  ...baseFields,
  type: v.literal("dns"),
  hostname: v.pipe(v.string(), v.minLength(1)),
  recordType: v.optional(v.string()),
  timeout: v.optional(v.number()),
});

export const MonitorConfigSchema = v.variant("type", [
  httpVariant("http"),
  httpVariant("https"),
  dnsVariant,
]);
