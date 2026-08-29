import { assertEquals, assertRejects } from "@std/assert";
import { discordChannel } from "./discord.ts";
import type { DiscordEndpointConfig } from "./discord.ts";

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

const config: DiscordEndpointConfig = {
  type: "discord",
  webhookUrl: "https://discord.example.com/webhook",
};

Deno.test("discord defaultSendOnDown/defaultSendOnUp message shape", () => {
  const ctx = { name: "svc", type: "http" as const, message: "boom" };
  assertEquals(discordChannel.defaultSendOnDown(config, ctx), {
    title: "Service is down: svc",
    description: "boom",
  });
  assertEquals(discordChannel.defaultSendOnUp(config, ctx), {
    title: "Service svc is up again",
    description: "boom",
  });
});

Deno.test("discord dispatch posts an embed payload to the webhook url", async () => {
  let seenUrl: string | null = null;
  let seenBody: unknown = null;
  await withMockedFetch(
    (input, init) => {
      seenUrl = input.toString();
      seenBody = JSON.parse(init!.body as string);
      return Promise.resolve(new Response(null, { status: 204 }));
    },
    () => discordChannel.dispatch(config, { title: "t", description: "d" }),
  );
  assertEquals(seenUrl, config.webhookUrl);
  assertEquals(seenBody, { embeds: [{ title: "t", description: "d" }] });
});

Deno.test("discord dispatch throws on a non-ok response", async () => {
  await withMockedFetch(
    () => Promise.resolve(new Response(null, { status: 500 })),
    () =>
      assertRejects(
        () => discordChannel.dispatch(config, { title: "t", description: "d" }),
        Error,
        "500",
      ),
  );
});
