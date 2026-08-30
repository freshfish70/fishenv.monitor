import { assertEquals, assertRejects } from "@std/assert";
import { discord } from "./discord.ts";
import type { NotificationEvent } from "../types/notification.ts";

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

const WEBHOOK = "https://discord.example.com/webhook";

function event(overrides: Partial<NotificationEvent> = {}): NotificationEvent {
  return {
    kind: "down",
    monitor: { id: "svc", name: "svc", type: "http" },
    message: "boom",
    state: "down",
    previousState: "up",
    checkedAt: new Date(),
    consecutive: 1,
    durationMs: 12,
    result: { status: 500, ok: false, headers: new Headers(), durationMs: 12 },
    ...overrides,
  };
}

Deno.test("the default format titles each event kind and includes the status field", async () => {
  const endpoint = discord({ webhookUrl: WEBHOOK });
  const bodies: Record<string, string>[] = [];
  const capture: typeof fetch = (_input, init) => {
    bodies.push(JSON.parse(init!.body as string).embeds[0]);
    return Promise.resolve(new Response(null, { status: 204 }));
  };

  await withMockedFetch(capture, async () => {
    await endpoint.notify(event());
    await endpoint.notify(event({ kind: "up", state: "up" }));
    await endpoint.notify(event({ kind: "still-down", consecutive: 4 }));
  });

  assertEquals(bodies.map((embed) => embed.title), [
    "Service is down: svc",
    "Service svc is up again",
    "Service is still down: svc",
  ]);
  assertEquals(bodies[0].description, "boom");

  const fields = bodies[0].fields as unknown as {
    name: string;
    value: string;
  }[];
  assertEquals(fields.find((field) => field.name === "Status")?.value, "500");
  // "Consecutive" is noise on a first failure and only shows up on repeats.
  assertEquals(fields.some((field) => field.name === "Consecutive"), false);

  const repeatFields = bodies[2].fields as unknown as {
    name: string;
    value: string;
  }[];
  assertEquals(
    repeatFields.find((field) => field.name === "Consecutive")?.value,
    "4 checks down",
  );
});

Deno.test("send() posts an embed payload to the webhook url", async () => {
  const endpoint = discord({ webhookUrl: WEBHOOK });
  let seenUrl: string | null = null;
  let seenBody: { embeds: unknown[] } | null = null;

  await withMockedFetch(
    (input, init) => {
      seenUrl = input.toString();
      seenBody = JSON.parse(init!.body as string);
      return Promise.resolve(new Response(null, { status: 204 }));
    },
    () => endpoint.send({ title: "t", description: "d", color: 0x112233 }),
  );

  assertEquals(seenUrl, WEBHOOK);
  assertEquals(seenBody!.embeds, [{
    title: "t",
    description: "d",
    color: 0x112233,
  }]);
});

Deno.test("dispatch throws on a non-ok response", async () => {
  const endpoint = discord({ webhookUrl: WEBHOOK });
  await withMockedFetch(
    () => Promise.resolve(new Response(null, { status: 500 })),
    () =>
      assertRejects(
        () => endpoint.send({ title: "t", description: "d" }),
        Error,
        "500",
      ),
  );
});
