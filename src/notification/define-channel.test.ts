import { assertEquals } from "@std/assert";
import { defineChannel } from "./define-channel.ts";
import type { NotificationEvent } from "../types/notification.ts";

interface TestConfig {
  target: string;
}

interface TestMessage {
  title: string;
  description: string;
  severity?: string;
}

function testEvent(
  overrides: Partial<NotificationEvent> = {},
): NotificationEvent {
  return {
    kind: "down",
    monitor: { id: "svc", name: "svc", type: "http" },
    message: "boom",
    state: "down",
    previousState: "up",
    checkedAt: new Date("2026-01-01T00:00:00.000Z"),
    consecutive: 1,
    durationMs: 12,
    result: { status: 500, ok: false, headers: new Headers(), durationMs: 12 },
    ...overrides,
  };
}

function testChannel(sent: TestMessage[]) {
  return defineChannel<TestConfig, TestMessage>({
    type: "test",
    defaultFormat: (_config, event) => ({
      title: `default:${event.kind}`,
      description: event.message,
    }),
    dispatch: (_config, message) => {
      sent.push(message);
      return Promise.resolve();
    },
  });
}

Deno.test("endpoint name defaults to the channel type and can be overridden", () => {
  const channel = testChannel([]);
  assertEquals(channel({ target: "a" }).name, "test");
  assertEquals(channel({ target: "a", name: "primary" }).name, "primary");
  assertEquals(channel({ target: "a" }).type, "test");
});

Deno.test("notify formats with the channel default and dispatches", async () => {
  const sent: TestMessage[] = [];
  const endpoint = testChannel(sent)({ target: "a" });

  assertEquals(await endpoint.notify(testEvent()), true);
  assertEquals(sent, [{ title: "default:down", description: "boom" }]);
});

Deno.test("a format override replaces the channel default", async () => {
  const sent: TestMessage[] = [];
  const endpoint = testChannel(sent)({
    target: "a",
    format: (config, event) => ({
      title: `${config.target}:${event.kind}`,
      description: event.message,
      severity: event.state,
    }),
  });

  await endpoint.notify(testEvent());
  assertEquals(sent, [{
    title: "a:down",
    description: "boom",
    severity: "down",
  }]);
});

Deno.test("format returning null vetoes the send", async () => {
  const sent: TestMessage[] = [];
  const endpoint = testChannel(sent)({
    target: "a",
    // Only care about real outages, not repeat reminders.
    format: (_config, event) =>
      event.kind === "still-down"
        ? null
        : { title: "t", description: event.message },
  });

  assertEquals(await endpoint.notify(testEvent({ kind: "still-down" })), false);
  assertEquals(sent, []);

  assertEquals(await endpoint.notify(testEvent()), true);
  assertEquals(sent.length, 1);
});

Deno.test("send() dispatches a message directly, bypassing format", async () => {
  const sent: TestMessage[] = [];
  const endpoint = testChannel(sent)({
    target: "a",
    format: () => null,
  });

  await endpoint.send({ title: "manual", description: "from user code" });
  assertEquals(sent, [{ title: "manual", description: "from user code" }]);
});
