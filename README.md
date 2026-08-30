# fishenv.monitor

A headless uptime monitor for Deno. Monitors are plain TypeScript files: you
export a config, the service loads every file it finds on startup, checks each
target on its own interval, stores results in SQLite, and notifies you when
something goes down (and again when it recovers).

There is no config UI and no YAML — a monitor is code, so `isDown`, `prepare`
and your notification formatting are just functions you write.

- Runtime: Deno 2.9+
- Package: [`jsr:@fishenv/monitor`](https://jsr.io/@fishenv/monitor)
- Storage: SQLite via kysely
- Ships as a single bundled `monitor.js` per release, plus a Docker image you
  build from the `Dockerfile` in this repo

## What's implemented today

| Monitor type                      | Status                                                               |
| --------------------------------- | -------------------------------------------------------------------- |
| `http` / `https`                  | ✅ implemented                                                       |
| `dns`                             | ✅ implemented                                                       |
| `tcp`, `ping`, `udp`, `websocket` | ❌ not implemented — `createMonitor()` rejects these at compile time |

| Notification channel        | Status                                                                         |
| --------------------------- | ------------------------------------------------------------------------------ |
| `discord`                   | ✅ implemented                                                                 |
| `slack`, `smtp`, `telegram` | ⚠️ config and message types exist, but `dispatch` throws `not implemented yet` |

Writing your own channel needs none of these — see
[Writing your own channel](#writing-your-own-channel).

## Quick start

```sh
git clone git@github.com:freshfish70/fishenv.monitor.git
cd fishenv.monitor
deno task start
```

Open <http://localhost:8081> for the dashboard, or
`curl localhost:8081/api/monitors`.

Tasks: `dev` (watch), `start`, `check`, `test`, `fmt`, `lint`, `bundle`.

## How it works

1. On startup the service globs `FISHENV_MONITORS_GLOB` (default
   `./monitors/**/*.ts`) and dynamically imports every match.
2. A file with a **default export** is treated as a monitor and validated. A
   file without one is skipped silently — that's how supporting modules like
   `notification.ts` can live in the same folder.
3. A broken file (syntax error, invalid shape, duplicate monitor name, duplicate
   endpoint name) is reported and skipped; the rest still start. Monitor `id` is
   a slug of `name`, so names must be unique.
4. Each monitor runs on its own `interval` loop. Every check is persisted. A
   notification fires when the monitor's `notify` policy says it should — by
   default, only on an up↔down transition.

## Defining a monitor

`monitors/example.ts`:

```ts
import { createMonitor } from "jsr:@fishenv/monitor";
import { alerts } from "./notification.ts";

export default createMonitor({
  name: "Example", // must be unique; the id is a slug of this
  type: "https",
  url: "https://example.com",
  interval: 30, // seconds
  notification: [alerts],
});
```

That's the minimum. With no `isDown`, the type's default is used: for HTTP, down
when the response is not 2xx or the request threw.

### HTTP / HTTPS options

| Field          | Type                                                                   | Notes                                                           |
| -------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------- |
| `name`         | `string`                                                               | Required, unique                                                |
| `type`         | `'http' \| 'https'`                                                    | Required                                                        |
| `url`          | `string`                                                               | Required, must parse as a URL                                   |
| `interval`     | `number`                                                               | Required, seconds, min 1                                        |
| `method`       | `string`                                                               | Default `GET`                                                   |
| `headers`      | `Record<string, string>`                                               |                                                                 |
| `body`         | `BodyInit`                                                             |                                                                 |
| `auth`         | `{ type: 'basic', username, password }` or `{ type: 'bearer', token }` |                                                                 |
| `timeout`      | `number`                                                               | ms, default `10_000`                                            |
| `notification` | `NotificationTarget[]`                                                 | Endpoints this monitor may notify                               |
| `notify`       | `NotifyPolicy`                                                         | When to notify. See [Notification policy](#notification-policy) |
| `prepare`      | `(config) => config`                                                   | Runs before each check                                          |
| `isDown`       | `(config, result) => IsDownResult`                                     | Overrides the default                                           |

The HTTP check result passed to `isDown` is
`{ status, ok, headers, durationMs, error? }`.

### DNS options

```ts
import { createMonitor } from "jsr:@fishenv/monitor";

export default createMonitor({
  name: "Root domain A record",
  type: "dns",
  hostname: "example.com",
  recordType: "A", // any Deno.RecordType, default 'A'
  interval: 300,
  timeout: 5000, // ms
});
```

The DNS result is `{ records, durationMs, error? }`, where `records` is `null`
on failure.

### Custom `isDown`

Return `down`, a `message` for the notification body, and optionally `channels`
to narrow which endpoints get told. Omit `channels` to notify every endpoint in
`notification`.

```ts
import { createMonitor } from "jsr:@fishenv/monitor";
import { alerts, oncall } from "./notification.ts";

export default createMonitor({
  name: "API",
  type: "https",
  url: "https://api.example.com/health",
  interval: 60,
  notification: [alerts, oncall],
  isDown: async (config, result) => {
    if (result.status === 500) {
      return {
        down: true,
        message: `500 from ${config.url}`,
        channels: [alerts, oncall], // page everyone
      };
    }
    return {
      down: !result.ok,
      message: result.ok
        ? "Service is up"
        : `Unexpected status ${result.status}`,
      channels: [alerts],
    };
  },
});
```

`channels` accepts the endpoint objects themselves (preferred — a typo is then a
compile error) or their names as strings. It only ever _narrows_ `notification`:
naming an endpoint the monitor doesn't declare is logged as a config mistake and
skipped.

### `prepare`

Called before every check, so it's the place for anything that expires — a
freshly minted token, a rotating signature, a timestamped header.

```ts
prepare: async (config) => ({
  ...config,
  headers: { ...config.headers, 'x-request-id': crypto.randomUUID() },
}),
```

## Notification policy

By default a monitor only notifies on a state transition. `notify` changes that.

```ts
notify: {
  on: ['down', 'up', 'still-down'],
  repeatEvery: 900,   // seconds
  cooldown: 60,       // seconds
}
```

| Field         | Default          | Meaning                                                              |
| ------------- | ---------------- | -------------------------------------------------------------------- |
| `on`          | `['down', 'up']` | Which event kinds to notify on                                       |
| `repeatEvery` | none             | Seconds between repeat (`still-*`) notifications                     |
| `cooldown`    | none             | Seconds an endpoint stays quiet after any send, applied per endpoint |

The four event kinds:

| Kind         | When                                                          |
| ------------ | ------------------------------------------------------------- |
| `down`       | The monitor just went down (or its first-ever check was down) |
| `up`         | The monitor just recovered                                    |
| `still-down` | A check confirmed it is still down — no transition            |
| `still-up`   | A check confirmed it is still up — no transition              |

A monitor's first check is never reported as `up`, so a healthy service does not
announce a recovery from nothing on startup.

**`still-*` without `repeatEvery` fires on every check.** That is the literal
"tell me every time" behavior, and on a 10s interval it is 8,640 messages a day
— enough to get a webhook rate-limited. Reach for `repeatEvery`:

```ts
// Alert on the outage, then nag every 15 minutes until it recovers.
notify: { on: ['down', 'up', 'still-down'], repeatEvery: 900 }
```

`repeatEvery` throttles only the `still-*` kinds; transitions always get
through. It is measured from the last send, so a value that is an exact multiple
of `interval` will usually land on the _next_ check after the window rather than
the one exactly on it.

`cooldown` is the blunter, per-endpoint floor — useful when several monitors
share a noisy endpoint. A failed send still consumes the cooldown, so a broken
webhook can't turn into a retry loop at check frequency.

## Notification endpoints

An endpoint is a channel plus its config. `monitors/notification.ts`:

```ts
import { discord } from "jsr:@fishenv/monitor";

export const alerts = discord({
  webhookUrl: Deno.env.get("DISCORD_WEBHOOK_URL") ?? "",
});
```

`name` defaults to the channel type, so this endpoint is `"discord"`. Give a
`name` explicitly when you want two endpoints of the same channel — that name is
what `channels` refers to, and duplicates on one monitor are rejected at load
time:

```ts
export const oncall = discord({
  name: "oncall",
  webhookUrl: Deno.env.get("DISCORD_ONCALL_WEBHOOK_URL") ?? "",
});
```

### Formatting

One hook, `format`, replaces the channel's default for every event kind. It
receives the endpoint's own config and the event, and returns the channel's
message type — or `null` to send nothing.

```ts
export const alerts = discord({
  webhookUrl: Deno.env.get("DISCORD_WEBHOOK_URL") ?? "",
  format: (_config, event) => {
    switch (event.kind) {
      case "down":
        return {
          title: `🔥 ${event.monitor.name} is down`,
          description: event.message,
          color: 0xe5484d,
        };
      case "up":
        return {
          title: `✅ ${event.monitor.name} recovered`,
          description: event.message,
          color: 0x30a46c,
        };
      case "still-down":
        return {
          title: `⏳ still down after ${event.consecutive} checks`,
          description: event.message,
        };
      default:
        return null; // don't send anything for still-up
    }
  },
});
```

The event carries the whole check, not just a string:

| Field                     | Type                                                  |
| ------------------------- | ----------------------------------------------------- |
| `kind`                    | `'down' \| 'up' \| 'still-down' \| 'still-up'`        |
| `monitor`                 | `{ id, name, type }`                                  |
| `message`                 | The message from `isDown`                             |
| `state` / `previousState` | `'up' \| 'down'` (`previousState` may be `'unknown'`) |
| `checkedAt`               | `Date`                                                |
| `consecutive`             | Checks in a row in this state, including this one     |
| `durationMs`              | How long the check took                               |
| `result`                  | The raw `HttpCheckResult` or `DnsCheckResult`         |

So `event.result.status` and `event.durationMs` are available without stuffing
them into `message` from `isDown`.

### Sending manually

Every endpoint exposes `send()`, which dispatches a message directly — no
formatting, no policy, no cooldown. Use it for ad-hoc alerts from your own code:

```ts
import { alerts } from "./monitors/notification.ts";

await alerts.send({
  title: "Deploy finished",
  description: "api@1.4.2 is live",
  color: 0x30a46c,
});
```

`send` takes the channel's message type, so Discord's `color` and `fields` are
type-checked here the same way they are inside `format`.

## Writing your own channel

`defineChannel` is the whole extension point — built-in channels are defined
with exactly this call, so there is no registry to edit and nothing to fork.

```ts
import { defineChannel } from "jsr:@fishenv/monitor";

interface PagerDutyConfig {
  routingKey: string;
}

interface PagerDutyMessage {
  title: string;
  description: string;
  severity: "critical" | "warning" | "info";
}

export const pagerduty = defineChannel<PagerDutyConfig, PagerDutyMessage>({
  type: "pagerduty",
  defaultFormat: (_config, event) => ({
    title: `${event.monitor.name} is ${event.state}`,
    description: event.message,
    severity: event.kind === "down" ? "critical" : "info",
  }),
  dispatch: async (config, message) => {
    const res = await fetch("https://events.pagerduty.com/v2/enqueue", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        routing_key: config.routingKey,
        event_action: "trigger",
        // A stable key per monitor lets PagerDuty dedupe repeats.
        dedup_key: message.title,
        payload: {
          summary: message.description,
          severity: message.severity,
          source: "fishenv.monitor",
        },
      }),
    });
    await res.body?.cancel();
    if (!res.ok) throw new Error(`PagerDuty responded with ${res.status}`);
  },
});
```

Then use it like any built-in:

```ts
export const oncall = pagerduty({ routingKey: Deno.env.get("PD_KEY") ?? "" });
```

`TMessage` defaults to `{ title, description }`, so a channel that needs nothing
richer can write `defineChannel<MyConfig>({ ... })` and reuse the shared
`defaultMessage(event)` helper for its `defaultFormat`.

## Delivery log

Every delivery attempt is recorded, successful or not, so a silent alert can be
told apart from one that was never attempted. Failures never stop the other
endpoints and never crash the check loop.

- `GET /api/notifications?limit=20` — recent attempts across all monitors
- The monitor detail page lists its own attempts, with the error for failed ones

A formatter returning `null` records nothing: no delivery was attempted, and no
cooldown starts.

## Configuration

| Variable                | Default              | Purpose             |
| ----------------------- | -------------------- | ------------------- |
| `FISHENV_MONITORS_GLOB` | `./monitors/**/*.ts` | Which files to load |
| `FISHENV_DB_PATH`       | `./monitor.sqlite`   | SQLite file         |
| `FISHENV_MONITOR_PORT`  | `8081`               | HTTP port           |

## HTTP surface

| Route                             | Returns                                                    |
| --------------------------------- | ---------------------------------------------------------- |
| `GET /`                           | HTML dashboard: every monitor, uptime pulse, aggregates    |
| `GET /monitors/:id`               | HTML detail page: last 100 checks and recent notifications |
| `GET /api/health`                 | `{ status, uptime }`                                       |
| `GET /api/monitors`               | All monitors and their current state                       |
| `GET /api/monitors/:id`           | One monitor                                                |
| `GET /api/results?limit=20`       | Flat feed of recent results, `limit` 1–100                 |
| `GET /api/notifications?limit=20` | Flat feed of delivery attempts, `limit` 1–100              |

## Docker

The image does not compile anything and copies nothing from the build context —
it downloads the released `monitor.js` bundle and runs it on Deno. Your monitor
files stay on the host and are mounted in, so editing a monitor never means
rebuilding the image.

### Build

```sh
# latest GitHub release
docker build -t fishenv-monitor .

# pin a release
docker build --build-arg MONITOR_VERSION=0.1.0 -t fishenv-monitor:0.1.0 .
```

Build args: `MONITOR_VERSION` (default `latest`), `MONITOR_REPO` (default
`freshfish70/fishenv.monitor`), `DENO_VERSION` (default `2.9.6`).

### Run with a mounted monitors directory

```sh
docker run -d --name monitor \
  -p 8081:8081 \
  -v "$PWD/monitors:/app/monitors:ro" \
  -v monitor-data:/app/data \
  -e DISCORD_WEBHOOK_URL="https://discord.com/api/webhooks/..." \
  fishenv-monitor
```

- `/app/monitors` — your monitor `.ts` files. Read-only is fine.
- `/app/data` — the SQLite database. Use a named volume so history survives an
  image upgrade.

Monitor files mounted at runtime are outside the bundle, so their `jsr:` imports
are fetched on first start. Give the container network access to `jsr.io`, or
bake the cache in if you run offline.

### Mounting several monitor directories

The default glob is `/app/monitors/**/*.ts`, which recurses — so mount each
source as a subdirectory and they all get picked up:

```sh
docker run -d --name monitor \
  -p 8081:8081 \
  -v "$PWD/monitors/prod:/app/monitors/prod:ro" \
  -v "$HOME/infra/dns-monitors:/app/monitors/dns:ro" \
  -v monitor-data:/app/data \
  fishenv-monitor
```

Remember that monitor names must be unique across _all_ mounted directories — a
duplicate name is reported at startup and that monitor is skipped.

To load from somewhere else entirely, override the glob:

```sh
docker run -d \
  -v "$PWD/checks:/checks:ro" \
  -e FISHENV_MONITORS_GLOB='/checks/**/*.ts' \
  fishenv-monitor
```

### docker compose

```yaml
services:
  monitor:
    build:
      context: .
      args:
        MONITOR_VERSION: latest
    # or, once you publish the image:
    # image: ghcr.io/freshfish70/fishenv-monitor:latest
    ports:
      - "8081:8081"
    volumes:
      - ./monitors:/app/monitors:ro
      - monitor-data:/app/data
    environment:
      DISCORD_WEBHOOK_URL: ${DISCORD_WEBHOOK_URL}
      FISHENV_MONITOR_PORT: "8081"
    restart: unless-stopped

volumes:
  monitor-data:
```

```sh
docker compose up -d
docker compose logs -f monitor
```

### Notes

- The container runs as the unprivileged `deno` user (uid 1000). If your mounted
  monitors directory is owned by another uid, either `chown` it or run with
  `--user "$(id -u):$(id -g)"`.
- The image declares a `HEALTHCHECK` against `/api/health`, so `docker ps` shows
  healthy/unhealthy directly.
- If no monitor loads, the service logs a warning and exits rather than idling —
  a restarting container usually means every monitor file failed to load. Check
  `docker compose logs`.

## Releasing

Push a version tag and CI does the rest:

```sh
git tag v0.1.1
git push origin v0.1.1
```

`.github/workflows/release-monitor.yml` runs `deno task check` and
`deno task test`, bundles `main.ts` with `deno bundle --minify`, and attaches
`monitor.js` to the GitHub release. That asset is what the `Dockerfile`
downloads.

## Upgrading from 0.1.x

0.2.0 reworked the notification API. The changes are mechanical:

| 0.1.x                                                  | 0.2.0                                                            |
| ------------------------------------------------------ | ---------------------------------------------------------------- |
| `createNotificationEndpoint({ type: 'discord', ... })` | `discord({ ... })` — import the channel directly                 |
| `sendOnDown` / `sendOnUp`                              | one `format(config, event)`, switching on `event.kind`           |
| `notify(direction, ctx)` on an endpoint                | `notify(event)`, plus a new `send(message)`                      |
| `ctx` of `{ name, type, message }`                     | a full `event` — see [Formatting](#formatting)                   |
| channel config type `{ type, name?, ... }`             | just the channel's own fields; `name` and `format` still allowed |
| adding a provider meant editing the channel registry   | `defineChannel(...)` anywhere, including user code               |

The database migrates itself on startup: a `consecutive` column is added to
`monitors` and a `notifications` table is created. Existing rows are untouched.
