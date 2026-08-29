import type {
  MonitorNotifyContext,
  NotificationEndpoint,
} from "../types/notification.ts";
import type { DiscordEndpointConfig } from "./discord.ts";
import type { SlackEndpointConfig } from "./slack.ts";
import type { SmtpEndpointConfig } from "./smtp.ts";
import type { TelegramEndpointConfig } from "./telegram.ts";
import { channelRegistry } from "./registry.ts";

type AnyEndpointConfig =
  | DiscordEndpointConfig
  | SlackEndpointConfig
  | SmtpEndpointConfig
  | TelegramEndpointConfig;

export function createNotificationEndpoint(
  config: DiscordEndpointConfig,
): NotificationEndpoint<"discord">;
export function createNotificationEndpoint(
  config: SlackEndpointConfig,
): NotificationEndpoint<"slack">;
export function createNotificationEndpoint(
  config: SmtpEndpointConfig,
): NotificationEndpoint<"smtp">;
export function createNotificationEndpoint(
  config: TelegramEndpointConfig,
): NotificationEndpoint<"telegram">;
export function createNotificationEndpoint(
  config: AnyEndpointConfig,
): NotificationEndpoint {
  const name = config.name ?? config.type;
  // The channel registry's entries each have their own concrete config type;
  // `config` here is already known (via the overloads above) to match
  // whichever channel `config.type` selects, so this cast is safe.
  // deno-lint-ignore no-explicit-any
  const channel = channelRegistry[config.type] as any;

  return {
    name,
    type: config.type,
    async notify(direction: "up" | "down", ctx: MonitorNotifyContext) {
      const builder = direction === "down"
        ? (config.sendOnDown ?? channel.defaultSendOnDown)
        : (config.sendOnUp ?? channel.defaultSendOnUp);
      const message = await builder(config, ctx);
      await channel.dispatch(config, message);
    },
  };
}
