import type {
  BaseNotificationEndpointConfig,
  MonitorNotifyContext,
  NotificationChannel,
  NotificationMessage,
} from "../types/notification.ts";

export interface SmtpEndpointConfig
  extends BaseNotificationEndpointConfig<"smtp"> {
  host: string;
  port: number;
  username?: string;
  password?: string;
  from: string;
  to: string | string[];
}

function defaultSendOnDown(
  _config: SmtpEndpointConfig,
  ctx: MonitorNotifyContext,
): NotificationMessage {
  return { title: `Service is down: ${ctx.name}`, description: ctx.message };
}

function defaultSendOnUp(
  _config: SmtpEndpointConfig,
  ctx: MonitorNotifyContext,
): NotificationMessage {
  return { title: `Service ${ctx.name} is up again`, description: ctx.message };
}

function dispatch(
  _config: SmtpEndpointConfig,
  _message: NotificationMessage,
): Promise<void> {
  throw new Error("The smtp notification channel is not implemented yet.");
}

export const smtpChannel: NotificationChannel<SmtpEndpointConfig> = {
  defaultSendOnDown,
  defaultSendOnUp,
  dispatch,
};
