// Compile-time only assertions for createMonitor()'s overload design.
// Run via `deno check`; nothing here executes at runtime.
import { createMonitor } from "./create-monitor.ts";

// http/https and dns are accepted and narrow their callbacks correctly.
createMonitor({
  name: "web",
  type: "http",
  interval: 30,
  url: "https://example.com",
  isDown: (config, result) => {
    // config narrows to HttpMonitorConfig, result to HttpCheckResult
    const _url: string = config.url;
    const _status: number = result.status;
    return { down: result.status !== 200, message: "" };
  },
});

createMonitor({
  name: "dns-check",
  type: "dns",
  interval: 60,
  hostname: "example.com",
  isDown: (config, result) => {
    const _hostname: string = config.hostname;
    const _records = result.records;
    return { down: result.records === null, message: "" };
  },
});

// Not-yet-implemented monitor types must fail to compile via the poison-pill overload.
// @ts-expect-error tcp monitors are not implemented yet
createMonitor({
  name: "tcp-check",
  type: "tcp",
  interval: 30,
  host: "example.com",
  port: 80,
});
// @ts-expect-error ping monitors are not implemented yet
createMonitor({
  name: "ping-check",
  type: "ping",
  interval: 30,
  host: "example.com",
});
// @ts-expect-error udp monitors are not implemented yet
createMonitor({
  name: "udp-check",
  type: "udp",
  interval: 30,
  host: "example.com",
  port: 53,
});
// @ts-expect-error websocket monitors are not implemented yet
createMonitor({
  name: "ws-check",
  type: "websocket",
  interval: 30,
  url: "wss://example.com",
});
