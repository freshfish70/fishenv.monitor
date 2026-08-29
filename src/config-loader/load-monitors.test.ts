import { assertEquals, assertStringIncludes } from "@std/assert";
import { loadMonitorConfigs } from "./load-monitors.ts";

async function writeFixture(
  dir: string,
  name: string,
  content: string,
): Promise<void> {
  await Deno.writeTextFile(`${dir}/${name}`, content);
}

Deno.test("loadMonitorConfigs loads good files and isolates broken ones", async () => {
  const dir = await Deno.makeTempDir();
  try {
    await writeFixture(
      dir,
      "good.ts",
      `export default { id: "good", name: "good", type: "http", interval: 30, url: "https://example.com" };\n`,
    );
    await writeFixture(dir, "syntax-error.ts", `export default {\n`);
    await writeFixture(
      dir,
      "duplicate-name.ts",
      `export default { id: "good-2", name: "good", type: "http", interval: 30, url: "https://example.com" };\n`,
    );
    await writeFixture(
      dir,
      "no-default-export.ts",
      `export const notDefault = 1;\n`,
    );
    await writeFixture(
      dir,
      "invalid-shape.ts",
      `export default { id: "bad", name: "bad", type: "http", interval: 30 };\n`, // missing required url
    );

    const { monitors, errors } = await loadMonitorConfigs(`${dir}/**/*.ts`);

    // Whichever of good.ts / duplicate-name.ts the glob visits first "wins" —
    // both declare monitor name "good", so exactly one loads and one errors.
    assertEquals(monitors.length, 1);
    assertEquals(monitors[0].name, "good");

    // no-default-export.ts is skipped silently (not an error) — the glob also
    // matches supporting modules like notification.ts with no default export.
    assertEquals(errors.length, 3);
    const errorFiles = errors.map((e) => e.file.split("/").pop()).sort();
    assertEquals(
      errorFiles.filter((f) => f === "duplicate-name.ts" || f === "good.ts")
        .length,
      1,
    );
    assertEquals(errorFiles.includes("invalid-shape.ts"), true);
    assertEquals(errorFiles.includes("syntax-error.ts"), true);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("loadMonitorConfigs loads a valid dns monitor", async () => {
  const dir = await Deno.makeTempDir();
  try {
    await writeFixture(
      dir,
      "dns.ts",
      `export default { id: "dns-check", name: "dns-check", type: "dns", interval: 60, hostname: "example.com" };\n`,
    );
    const { monitors, errors } = await loadMonitorConfigs(`${dir}/**/*.ts`);
    assertEquals(errors, []);
    assertEquals(monitors.length, 1);
    assertEquals(monitors[0].type, "dns");
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("loadMonitorConfigs silently skips files with no default export", async () => {
  const dir = await Deno.makeTempDir();
  try {
    await writeFixture(
      dir,
      "notification.ts",
      `export const discord = { name: "discord", type: "discord", notify: () => Promise.resolve() };\n`,
    );
    const { monitors, errors } = await loadMonitorConfigs(`${dir}/**/*.ts`);
    assertEquals(monitors, []);
    assertEquals(errors, []);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("loadMonitorConfigs returns no monitors or errors for an empty directory", async () => {
  const dir = await Deno.makeTempDir();
  try {
    const { monitors, errors } = await loadMonitorConfigs(`${dir}/**/*.ts`);
    assertEquals(monitors, []);
    assertEquals(errors, []);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("loadMonitorConfigs error messages are useful", async () => {
  const dir = await Deno.makeTempDir();
  try {
    await writeFixture(
      dir,
      "duplicate-a.ts",
      `export default { id: "a", name: "svc", type: "http", interval: 30, url: "https://example.com" };\n`,
    );
    await writeFixture(
      dir,
      "duplicate-b.ts",
      `export default { id: "b", name: "svc", type: "http", interval: 30, url: "https://example.com" };\n`,
    );
    const { errors } = await loadMonitorConfigs(`${dir}/**/*.ts`);
    assertEquals(errors.length, 1);
    assertStringIncludes(String((errors[0].error as Error).message), "svc");
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});
