import type { MonitorType } from "./monitor.ts";

export type NotificationType = "discord" | "slack" | "smtp" | "telegram";

export interface MonitorNotifyContext {
  name: string;
  type: MonitorType;
  message: string;
}

export interface NotificationMessage {
  title: string;
  description: string;
}

export interface NotificationEndpoint<
  TType extends NotificationType = NotificationType,
> {
  name: string;
  type: TType;
  notify(direction: "up" | "down", ctx: MonitorNotifyContext): Promise<void>;
}

/** Fields shared by every channel's `createNotificationEndpoint()` config. */
export interface BaseNotificationEndpointConfig<
  TType extends NotificationType,
> {
  /** Defaults to `type` if omitted. Must be unique across endpoints of the same type. */
  name?: string;
  type: TType;
  sendOnDown?(
    config: this,
    ctx: MonitorNotifyContext,
  ): NotificationMessage | Promise<NotificationMessage>;
  sendOnUp?(
    config: this,
    ctx: MonitorNotifyContext,
  ): NotificationMessage | Promise<NotificationMessage>;
}

/** What each channel module (discord.ts, slack.ts, ...) implements. */
export interface NotificationChannel<TConfig> {
  defaultSendOnDown(
    config: TConfig,
    ctx: MonitorNotifyContext,
  ): NotificationMessage;
  defaultSendOnUp(
    config: TConfig,
    ctx: MonitorNotifyContext,
  ): NotificationMessage;
  dispatch(config: TConfig, message: NotificationMessage): Promise<void>;
}
