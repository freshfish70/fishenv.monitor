import type {
  ChannelFactory,
  NotificationChannel,
  NotificationMessage,
} from "../types/notification.ts";

/**
 * Turns a channel implementation into the factory users call.
 *
 * This is the whole provider extension point: built-in channels and ones
 * written in user code are the same thing, so adding a provider never means
 * editing a central registry or a list of overloads.
 *
 * ```ts
 * const pagerduty = defineChannel<{ routingKey: string }>({
 *   type: "pagerduty",
 *   defaultFormat: (_config, event) => ({
 *     title: `${event.monitor.name} is ${event.state}`,
 *     description: event.message,
 *   }),
 *   dispatch: async (config, message) => { ... },
 * });
 *
 * export const oncall = pagerduty({ routingKey: "..." });
 * ```
 */
export function defineChannel<TConfig, TMessage = NotificationMessage>(
  channel: NotificationChannel<TConfig, TMessage>,
): ChannelFactory<TConfig, TMessage> {
  return (config) => ({
    name: config.name ?? channel.type,
    type: channel.type,

    async notify(event) {
      const format = config.format ?? channel.defaultFormat;
      const message = await format(config, event);
      if (message === null) return false;
      await channel.dispatch(config, message);
      return true;
    },

    send(message) {
      return channel.dispatch(config, message);
    },
  });
}
