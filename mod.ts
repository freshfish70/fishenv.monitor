export { createMonitor } from "./src/monitors/create-monitor.ts";
export { createNotificationEndpoint } from "./src/notification/create-notification-endpoint.ts";

export type {
  DnsMonitorConfig,
  HttpAuth,
  HttpMonitorConfig,
  IsDownResult,
  MonitorConfig,
  MonitorType,
  NormalizedMonitorConfig,
} from "./src/types/monitor.ts";

export type {
  BaseNotificationEndpointConfig,
  MonitorNotifyContext,
  NotificationChannel,
  NotificationEndpoint,
  NotificationMessage,
  NotificationType,
} from "./src/types/notification.ts";

export type { DnsCheckResult, HttpCheckResult } from "./src/types/result.ts";

export type { DiscordEndpointConfig } from "./src/notification/discord.ts";
export type { SlackEndpointConfig } from "./src/notification/slack.ts";
export type { SmtpEndpointConfig } from "./src/notification/smtp.ts";
export type { TelegramEndpointConfig } from "./src/notification/telegram.ts";
