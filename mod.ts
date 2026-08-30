export { createMonitor } from "./src/monitors/create-monitor.ts";
export { defineChannel } from "./src/notification/define-channel.ts";
export { defaultMessage, defaultTitle } from "./src/notification/format.ts";

export { discord } from "./src/notification/discord.ts";
export { slack } from "./src/notification/slack.ts";
export { smtp } from "./src/notification/smtp.ts";
export { telegram } from "./src/notification/telegram.ts";

export type {
  DnsMonitorConfig,
  HttpAuth,
  HttpMonitorConfig,
  IsDownResult,
  MonitorConfig,
  MonitorState,
  MonitorType,
  NormalizedMonitorConfig,
  NotifyPolicy,
} from "./src/types/monitor.ts";

export type {
  ChannelFactory,
  EndpointConfig,
  NotificationChannel,
  NotificationEndpoint,
  NotificationEvent,
  NotificationEventKind,
  NotificationMessage,
  NotificationTarget,
} from "./src/types/notification.ts";

export type {
  CheckResult,
  DnsCheckResult,
  HttpCheckResult,
} from "./src/types/result.ts";

export type {
  DiscordEndpointConfig,
  DiscordMessage,
} from "./src/notification/discord.ts";
export type {
  SlackEndpointConfig,
  SlackMessage,
} from "./src/notification/slack.ts";
export type {
  SmtpEndpointConfig,
  SmtpMessage,
} from "./src/notification/smtp.ts";
export type {
  TelegramEndpointConfig,
  TelegramMessage,
} from "./src/notification/telegram.ts";
