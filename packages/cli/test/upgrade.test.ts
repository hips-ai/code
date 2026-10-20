import { describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

describe("upgrade command", () => {
  test("is registered in root help and takes no version or method", async () => {
    const root = await cli(["--help"], {}, "../src/index.ts")
    const help = await cli(["upgrade", "--help"], {}, "../src/index.ts")
    expect(root.exitCode).toBe(0)
    expect(root.stdout).toContain("upgrade")
    expect(help.exitCode).toBe(0)
    expect(help.stdout).toContain("Update HIPS Code from its git checkout")
    expect(help.stdout).not.toContain("--method")
    expect(help.stdout).not.toContain("<target>")
  })

  test("pulls the checkout and reports the old and new commit", async () => {
    const result = await cli([])
    expect(result.exitCode).toBe(0)
    expect(result.events).toEqual(["checkout", { upgrade: "/checkout" }])
    expect(result.stdout).toContain("Updated abc1234 → def5678")
    expect(result.stdout).toContain("No background service was running")
  })

  test("stops when the checkout is already up to date", async () => {
    const result = await cli([], { UPGRADE_TEST_PULL: "current" })
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("Already up to date at abc1234")
    expect(result.stdout).not.toContain("background service")
  })

  test("shows git's message and stops when the pull fails", async () => {
    const result = await cli([], { UPGRADE_TEST_PULL: "diverged" })
    expect(result.exitCode).toBe(1)
    expect(result.stdout).toContain("Upgrade failed")
    expect(result.stdout).toContain("fatal: Not possible to fast-forward, aborting.")
    expect(result.stdout).toContain("git -C /checkout pull --ff-only")
    expect(result.stdout).not.toContain("background service")
  })

  test("only explains how updates work in a build without a checkout", async () => {
    const result = await cli([], { UPGRADE_TEST_PULL: "compiled" })
    expect(result.exitCode).toBe(0)
    expect(result.events).toEqual(["checkout"])
    expect(result.stdout).toContain("HIPS Code updates from its git checkout")
  })

  test("rejects a version argument", async () => {
    const result = await cli(["2.0.0"])
    expect(result.exitCode).not.toBe(0)
    expect(result.events).toEqual([])
  })
})

async function cli(args: string[], env: Record<string, string> = {}, entry = "fixture/upgrade.ts") {
  const root = await mkdtemp(path.join(os.tmpdir(), "opencode-upgrade-"))
  try {
    const child = Bun.spawn(
      [process.execPath, "--define", 'OPENCODE_VERSION="0.0.0-beta-old"', path.join(import.meta.dir, entry), ...args],
      {
        cwd: path.join(import.meta.dir, ".."),
        env: {
          ...process.env,
          OPENCODE_TEST_HOME: root,
          XDG_DATA_HOME: path.join(root, "data"),
          XDG_CONFIG_HOME: path.join(root, "config"),
          XDG_CACHE_HOME: path.join(root, "cache"),
          XDG_STATE_HOME: path.join(root, "state"),
          OPENCODE_DISABLE_AUTOUPDATE: "1",
          ...env,
        },
        stdout: "pipe",
        stderr: "pipe",
      },
    )
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ])
    const events = stdout
      .split("\n")
      .filter((line) => line.startsWith("EVENT "))
      .map((line) => JSON.parse(line.slice(6)))
    expect(await Bun.file(path.join(root, "state", "opencode", "service-local.json")).exists()).toBe(false)
    return { stdout, stderr, exitCode, events }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}
