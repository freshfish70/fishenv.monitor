// Compile-time only assertions for the channel/endpoint types.
// Run via `deno check`; nothing here executes at runtime.
import { defineChannel } from "./define-channel.ts";
import { discord } from "./discord.ts";
import type { DiscordMessage } from "./discord.ts";
import type { NotificationTarget } from "../types/notification.ts";

// A channel's own message type reaches a user-supplied `format`.
const _rich = discord({
  webhookUrl: "https://example.com",
  format: (config, event): DiscordMessage => {
    const _url: string = config.webhookUrl;
    return { title: event.monitor.name, description: event.message, color: 1 };
  },
});

// ...and `send` takes that same message type.
await _rich.send({ title: "t", description: "d", color: 2, fields: [] });

// @ts-expect-error `color` must be a number, not a string
await _rich.send({ title: "t", description: "d", color: "red" });

// @ts-expect-error webhookUrl is required by DiscordEndpointConfig
discord({ name: "no-url" });

// A user-defined channel needs no registration to be usable as a target.
const custom = defineChannel<{ url: string }>({
  type: "custom",
  defaultFormat: (_config, event) => ({
    title: event.monitor.name,
    description: event.message,
  }),
  dispatch: () => Promise.resolve(),
});
const _target: NotificationTarget = custom({ url: "https://example.com" });

// Endpoints of different channels — and so different message types — still mix
// in a monitor's notification list.
const _mixed: NotificationTarget[] = [_rich, _target];
