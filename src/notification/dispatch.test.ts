import { assertEquals } from "@std/assert";
import { notifyTransition } from "./dispatch.ts";
import type { HttpMonitorConfig } from "../types/monitor.ts";
import type { NotificationEndpoint } from "../types/notification.ts";

function fakeEndpoint(
  name: string,
  notifications: string[],
): NotificationEndpoint<"discord"> {
  return {
    name,
    type: "discord",
    notify(direction) {
      notifications.push(`${name}:${direction}`);
      return Promise.resolve();
    },
  };
}

Deno.test("notifyTransition notifies every endpoint when channels is omitted", async () => {
  const notified: string[] = [];
  const a = fakeEndpoint("a", notified);
  const b = fakeEndpoint("b", notified);
  const monitor: HttpMonitorConfig = {
    name: "svc",
    type: "http",
    interval: 30,
    url: "https://example.com",
    notification: [a, b],
  };

  await notifyTransition(monitor, "down", { down: true, message: "boom" }, {
    name: "svc",
    type: "http",
    message: "boom",
  });

  assertEquals(notified.sort(), ["a:down", "b:down"]);
});

Deno.test("notifyTransition only notifies channels named in isDownResult.channels", async () => {
  const notified: string[] = [];
  const a = fakeEndpoint("a", notified);
  const b = fakeEndpoint("b", notified);
  const monitor: HttpMonitorConfig = {
    name: "svc",
    type: "http",
    interval: 30,
    url: "https://example.com",
    notification: [a, b],
  };

  await notifyTransition(monitor, "down", {
    down: true,
    message: "boom",
    channels: ["b"],
  }, {
    name: "svc",
    type: "http",
    message: "boom",
  });

  assertEquals(notified, ["b:down"]);
});

Deno.test("notifyTransition skips unknown channel names without throwing", async () => {
  const notified: string[] = [];
  const a = fakeEndpoint("a", notified);
  const monitor: HttpMonitorConfig = {
    name: "svc",
    type: "http",
    interval: 30,
    url: "https://example.com",
    notification: [a],
  };

  await notifyTransition(monitor, "up", {
    down: false,
    message: "ok",
    channels: ["nonexistent"],
  }, {
    name: "svc",
    type: "http",
    message: "ok",
  });

  assertEquals(notified, []);
});

Deno.test("notifyTransition does not throw when one endpoint's notify() rejects", async () => {
  const notified: string[] = [];
  const a = fakeEndpoint("a", notified);
  const failing: NotificationEndpoint<"discord"> = {
    name: "failing",
    type: "discord",
    notify: () => Promise.reject(new Error("boom")),
  };
  const monitor: HttpMonitorConfig = {
    name: "svc",
    type: "http",
    interval: 30,
    url: "https://example.com",
    notification: [a, failing],
  };

  await notifyTransition(monitor, "down", { down: true, message: "x" }, {
    name: "svc",
    type: "http",
    message: "x",
  });

  assertEquals(notified, ["a:down"]);
});
