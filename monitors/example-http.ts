import { createMonitor } from "../mod.ts";
import { alerts, oncall } from "./notification.ts";

export default createMonitor({
  name: "Example HTTP Monitor",
  type: "https",
  url: "https://example.com",
  interval: 10,
  notification: [alerts, oncall],
  // Keep hearing about an outage, but at most once every 15 minutes.
  notify: {
    on: ["down", "up", "still-down"],
    repeatEvery: 900,
  },
  isDown: (_config, result) => {
    const down = Math.random() < 0.5;
    return {
      down,
      message: down
        ? `Randomly generated down status (last status ${result.status})`
        : "Service is up",
      // Page the on-call endpoint only for real outages.
      channels: down ? [alerts, oncall] : [alerts],
    };
  },
});
