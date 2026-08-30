import type { MonitorState, MonitorType } from "./monitor.ts";
import type { CheckResult } from "./result.ts";

/**
 * Why an endpoint is being notified.
 *
 * `down`/`up` are state transitions. `still-down`/`still-up` are emitted on
 * every check that did NOT transition, and only reach an endpoint if the
 * monitor's `notify.on` policy asks for them — see {@link NotifyPolicy}.
 *
 * Adding a kind here is deliberately cheap: it costs one `case` in a
 * formatter, not a new hook on every channel.
 */
export type NotificationEventKind = "down" | "up" | "still-down" | "still-up";

/** Everything known about the check that triggered a notification. */
export interface NotificationEvent {
  kind: NotificationEventKind;
  monitor: { id: string; name: string; type: MonitorType };
  /** The message from `isDown` (or the type's default). */
  message: string;
  state: Exclude<MonitorState, "unknown">;
  /** "unknown" only on the monitor's very first recorded check. */
  previousState: MonitorState;
  checkedAt: Date;
  /** Consecutive checks that produced `state`, including this one. */
  consecutive: number;
  durationMs: number;
  /** The raw checker output — an HttpCheckResult or DnsCheckResult. */
  result: CheckResult;
}

/** The default message shape. A channel may define a richer one. */
export interface NotificationMessage {
  title: string;
  description: string;
}

/**
 * The half of an endpoint the scheduler needs. Monitors hold these, so a
 * monitor can mix endpoints whose message types differ.
 */
export interface NotificationTarget {
  readonly name: string;
  readonly type: string;
  /** Formats and dispatches `event`. Returns false if the formatter vetoed it. */
  notify(event: NotificationEvent): Promise<boolean>;
}

/** A concrete endpoint, adding a manual send in the channel's message shape. */
export interface NotificationEndpoint<TMessage = NotificationMessage>
  extends NotificationTarget {
  /** Dispatches `message` as-is, bypassing formatting and every policy. */
  send(message: TMessage): Promise<void>;
}

/**
 * What a provider implements. `TMessage` is the channel's own message shape,
 * so a channel with embeds/blocks/severity is not forced through
 * {@link NotificationMessage}.
 */
export interface NotificationChannel<TConfig, TMessage = NotificationMessage> {
  /** Label for logs, the dashboard, and an endpoint's default name. */
  type: string;
  /** Return `null` to send nothing for this event. */
  defaultFormat(
    config: TConfig,
    event: NotificationEvent,
  ): TMessage | null;
  dispatch(config: TConfig, message: TMessage): Promise<void>;
}

/** A channel's config plus the two things every endpoint can override. */
export type EndpointConfig<TConfig, TMessage> = TConfig & {
  /** Defaults to the channel's `type`. Must be unique within a monitor. */
  name?: string;
  /** Replaces the channel's `defaultFormat`. Return `null` to send nothing. */
  format?(
    config: TConfig,
    event: NotificationEvent,
  ): TMessage | null | Promise<TMessage | null>;
};

/** What {@link defineChannel} returns: call it to get an endpoint. */
export type ChannelFactory<TConfig, TMessage = NotificationMessage> = (
  config: EndpointConfig<TConfig, TMessage>,
) => NotificationEndpoint<TMessage>;
