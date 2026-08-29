import { assertEquals, assertRejects } from "@std/assert";
import { createNotificationEndpoint } from "./create-notification-endpoint.ts";

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

const ctx = { name: "svc", type: "http" as const, message: "boom" };

Deno.test("createNotificationEndpoint defaults name to the channel type", () => {
  const endpoint = createNotificationEndpoint({
    type: "discord",
    webhookUrl: "https://x.example.com",
  });
  assertEquals(endpoint.name, "discord");
});

Deno.test("createNotificationEndpoint respects an explicit name", () => {
  const endpoint = createNotificationEndpoint({
    type: "discord",
    name: "discord-oncall",
    webhookUrl: "https://x.example.com",
  });
  assertEquals(endpoint.name, "discord-oncall");
});

Deno.test("discord endpoint notify() dispatches through fetch with the default down message", async () => {
  let seenBody: unknown = null;
  const endpoint = createNotificationEndpoint({
    type: "discord",
    webhookUrl: "https://x.example.com",
  });
  await withMockedFetch(
    (_input, init) => {
      seenBody = JSON.parse(init!.body as string);
      return Promise.resolve(new Response(null, { status: 204 }));
    },
    () => endpoint.notify("down", ctx),
  );
  assertEquals(seenBody, {
    embeds: [{ title: "Service is down: svc", description: "boom" }],
  });
});

Deno.test("discord endpoint notify() uses a custom sendOnDown when provided", async () => {
  let seenBody: unknown = null;
  const endpoint = createNotificationEndpoint({
    type: "discord",
    webhookUrl: "https://x.example.com",
    sendOnDown: (_config, notifyCtx) => ({
      title: "custom",
      description: notifyCtx.message,
    }),
  });
  await withMockedFetch(
    (_input, init) => {
      seenBody = JSON.parse(init!.body as string);
      return Promise.resolve(new Response(null, { status: 204 }));
    },
    () => endpoint.notify("down", ctx),
  );
  assertEquals(seenBody, {
    embeds: [{ title: "custom", description: "boom" }],
  });
});

Deno.test("slack/smtp/telegram endpoints reject with 'not implemented' when notified", async () => {
  const slack = createNotificationEndpoint({
    type: "slack",
    webhookUrl: "https://x.example.com",
  });
  await assertRejects(
    () => slack.notify("down", ctx),
    Error,
    "not implemented",
  );

  const smtp = createNotificationEndpoint({
    type: "smtp",
    host: "smtp.example.com",
    port: 587,
    from: "a@example.com",
    to: "b@example.com",
  });
  await assertRejects(() => smtp.notify("down", ctx), Error, "not implemented");

  const telegram = createNotificationEndpoint({
    type: "telegram",
    botToken: "t",
    chatId: "1",
  });
  await assertRejects(
    () => telegram.notify("down", ctx),
    Error,
    "not implemented",
  );
});
