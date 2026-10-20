import { NodeServices } from "@effect/platform-node"
import { EffectFlock } from "@opencode/util/effect-flock"
import { LayerNode } from "@opencode/util/effect/layer-node"
import { Global } from "@opencode/util/global"
import { AppProcess } from "@opencode/util/process"
import { expect, spyOn, test } from "bun:test"
import { Effect, FileSystem, Layer, PlatformError, Stream } from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/process"
import { existsSync, readdirSync } from "node:fs"
import path from "node:path"
import { Updater } from "../src/services/updater"
import { testEffect } from "../../core/test/lib/effect"

const it = testEffect(NodeServices.layer)

declare const OPENCODE_CLI_NAME: string | undefined
declare const OPENCODE_CHANNEL: string | undefined

function fixture(
  respond: (command: ChildProcess.StandardCommand) => Partial<AppProcess.RunResult> & {
    error?: AppProcess.AppProcessError
  } = () => ({}),
  name = "@opencode/cli",
  formula?: string,
  executableOverride?: (root: string, home: string) => Effect.Effect<string, PlatformError.PlatformError, FileSystem.FileSystem>,
) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
    const root = yield* fs.makeTempDirectoryScoped({ prefix: "opencode-updater-" })
    const execPath = process.execPath
    const modules = path.join(root, "node_modules")
    const executable = executableOverride
      ? yield* executableOverride(root, path.join(root, "home"))
      : formula
        ? path.join(root, "Cellar", formula, "2.0.20", "bin", "opencode")
        : path.join(modules, "@opencode", "cli", "bin", "opencode")
    yield* fs.makeDirectory(path.dirname(executable), { recursive: true })
    yield* fs.writeFileString(executable, "binary")
    if (!formula && !executableOverride)
      yield* fs.writeFileString(
        path.join(modules, "@opencode", "cli", "package.json"),
        JSON.stringify({ name, bin: { opencode: "bin/opencode" } }),
      )
    const requests: string[] = []
    // Updates come from git; any HTTP request would mean a release service is still contacted.
    yield* Effect.acquireRelease(
      Effect.sync(() =>
        spyOn(globalThis, "fetch").mockImplementation(
          Object.assign(
            async (input: string | URL | Request) => {
              requests.push(input instanceof Request ? input.url : input.toString())
              return Response.error()
            },
            { preconnect: fetch.preconnect },
          ),
        ),
      ),
      (request) => Effect.sync(() => request.mockRestore()),
    )
    const global = Global.make({
      home: path.join(root, "home"),
      data: path.join(root, "data"),
      cache: path.join(root, "cache"),
      config: path.join(root, "config"),
      state: path.join(root, "state"),
      tmp: path.join(root, "tmp"),
      bin: path.join(root, "bin"),
      log: path.join(root, "log"),
      repos: path.join(root, "repos"),
    })
    const commands: string[][] = []
    const updater = yield* Updater.Service.pipe(
      Effect.provide(Updater.layer),
      Effect.provide(
        LayerNode.compile(EffectFlock.node, {
          replacements: [Global.node.replace(Layer.succeed(Global.Service, global))],
        }),
      ),
      Effect.provideService(Global.Service, global),
      Effect.provideService(FileSystem.FileSystem, {
        ...fs,
        realPath: (input) => (input === execPath ? fs.realPath(executable) : fs.realPath(input)),
      }),
      Effect.provideService(
        AppProcess.Service,
        AppProcess.Service.of({
          ...spawner,
          run: (command) =>
            Effect.suspend(() => {
              if (command._tag !== "StandardCommand") return Effect.die("Unexpected piped command")
              commands.push([command.command, ...command.args])
              const result = respond(command)
              if (result.error) return Effect.fail(result.error)
              return Effect.succeed({
                command: command.command,
                exitCode: 0,
                stdout: Buffer.alloc(0),
                stderr: Buffer.alloc(0),
                stdoutTruncated: false,
                stderrTruncated: false,
                ...result,
              })
            }),
          runStream: () => Stream.die("Unexpected streaming command"),
        }),
      ),
    )
    return { updater, commands, requests, global, fs, executable }
  })
}

const windows = process.platform === "win32" ? it.live : it.live.skip
const unix = process.platform === "win32" ? it.live.skip : it.live

const source = path.join(import.meta.dir, "..", "src", "services")
const checkout = path.join(path.sep, "work", "hips-code")
const git = (...args: string[]) => ["git", "-C", checkout, ...args]
const bun = process.versions.bun ? process.execPath : "bun"

// Answers git like a checkout whose HEAD moves from `before` to `after` when pulled.
function repository(input: {
  readonly before?: string
  readonly after?: string
  readonly pull?: Partial<AppProcess.RunResult>
  readonly install?: Partial<AppProcess.RunResult>
  readonly behind?: string
}) {
  const head = { pulled: false }
  return (command: ChildProcess.StandardCommand): Partial<AppProcess.RunResult> => {
    const args = command.args.join(" ")
    if (command.command === bun) {
      expect(command.options.cwd).toBe(checkout)
      return input.install ?? {}
    }
    expect(command.command).toBe("git")
    expect(command.options.env?.GIT_TERMINAL_PROMPT).toBe(args.endsWith("--show-toplevel") ? undefined : "0")
    if (args.endsWith("rev-parse --show-toplevel")) return { stdout: Buffer.from(`${checkout}\n`) }
    if (args.endsWith("rev-parse --short HEAD"))
      return { stdout: Buffer.from(`${head.pulled ? (input.after ?? "def5678") : (input.before ?? "abc1234")}\n`) }
    if (args.endsWith("pull --ff-only")) {
      head.pulled = (input.pull?.exitCode ?? 0) === 0
      return input.pull ?? {}
    }
    if (args.endsWith("rev-list --count HEAD..@{upstream}")) return { stdout: Buffer.from(`${input.behind ?? "0"}\n`) }
    if (args.endsWith("rev-parse --short @{upstream}")) return { stdout: Buffer.from("def5678\n") }
    return {}
  }
}

it.live("checkout resolves the repository that holds the CLI source, not the working directory", () =>
  Effect.gen(function* () {
    const test = yield* fixture(repository({}))
    expect(yield* test.updater.checkout()).toBe(checkout)
    expect(test.commands).toEqual([["git", "-C", source, "rev-parse", "--show-toplevel"]])
  }),
)

it.live("checkout is unavailable outside a git repository", () =>
  Effect.gen(function* () {
    const test = yield* fixture(() => ({ exitCode: 128, stderr: Buffer.from("fatal: not a git repository") }))
    expect(yield* test.updater.checkout()).toBeUndefined()
    const missing = yield* fixture(() => ({ error: new AppProcess.AppProcessError({ command: "git" }) }))
    expect(yield* missing.updater.checkout()).toBeUndefined()
  }),
)

it.live("upgrade fast-forwards the checkout, then installs its dependencies", () =>
  Effect.gen(function* () {
    const test = yield* fixture(repository({}))
    expect(yield* test.updater.upgrade(checkout)).toEqual({ from: "abc1234", to: "def5678" })
    expect(test.commands).toEqual([
      git("rev-parse", "--short", "HEAD"),
      git("pull", "--ff-only"),
      git("rev-parse", "--short", "HEAD"),
      [bun, "install"],
    ])
    expect(test.requests).toEqual([])
  }),
)

it.live("upgrade skips the install when the checkout is already up to date", () =>
  Effect.gen(function* () {
    const test = yield* fixture(repository({ after: "abc1234" }))
    expect(yield* test.updater.upgrade(checkout)).toEqual({ from: "abc1234", to: "abc1234" })
    expect(test.commands).toEqual([
      git("rev-parse", "--short", "HEAD"),
      git("pull", "--ff-only"),
      git("rev-parse", "--short", "HEAD"),
    ])
  }),
)

it.live("upgrade shows git's message and installs nothing when the pull fails", () =>
  Effect.gen(function* () {
    const test = yield* fixture(
      repository({
        pull: {
          exitCode: 128,
          stderr: Buffer.from("hint: Diverging branches can't be fast-forwarded\nfatal: Not possible to fast-forward, aborting.\n"),
        },
      }),
    )
    const error = yield* test.updater.upgrade(checkout).pipe(Effect.flip)
    expect(error).toBeInstanceOf(Updater.UpgradeError)
    expect(error.title).toBe("Could not pull HIPS Code updates")
    expect(error.detail).toBe(
      "hint: Diverging branches can't be fast-forwarded\nfatal: Not possible to fast-forward, aborting.",
    )
    expect(error.command).toBe(git("pull", "--ff-only").join(" "))
    expect(test.commands).toEqual([git("rev-parse", "--short", "HEAD"), git("pull", "--ff-only")])
  }),
)

it.live("upgrade explains how to finish when the install fails after a pull", () =>
  Effect.gen(function* () {
    const test = yield* fixture(repository({ install: { exitCode: 1, stderr: Buffer.from("error: lockfile had changes") } }))
    const error = yield* test.updater.upgrade(checkout).pipe(Effect.flip)
    expect(error.title).toBe("Pulled abc1234 → def5678, but bun install failed")
    expect(error.detail).toBe("error: lockfile had changes")
    expect(error.retry).toBe(`Run bun install in ${checkout}, then start HIPS Code again.`)
  }),
)

it.live("check fetches and compares HEAD with its upstream", () =>
  Effect.gen(function* () {
    const behind = yield* fixture(repository({ behind: "3" }))
    expect(yield* behind.updater.check()).toEqual({ type: "available", version: "def5678" })
    expect(behind.commands).toEqual([
      ["git", "-C", source, "rev-parse", "--show-toplevel"],
      git("fetch", "--quiet"),
      git("rev-list", "--count", "HEAD..@{upstream}"),
      git("rev-parse", "--short", "@{upstream}"),
    ])
    const current = yield* fixture(repository({ behind: "0" }))
    expect(yield* current.updater.check()).toBeUndefined()
    expect(behind.requests).toEqual([])
  }),
)

it.live("check reports git's message when the branch has no upstream", () =>
  Effect.gen(function* () {
    const test = yield* fixture((command) =>
      command.args.at(-1) === "HEAD..@{upstream}"
        ? { exitCode: 128, stderr: Buffer.from("fatal: no upstream configured for branch 'work'") }
        : repository({})(command),
    )
    const error = yield* test.updater.check().pipe(Effect.flip)
    expect(error.message).toBe("fatal: no upstream configured for branch 'work'")
  }),
)

it.live("background checks only notify and respect a disabled update policy", () =>
  Effect.gen(function* () {
    const available = yield* fixture(repository({ behind: "1" }))
    expect(yield* available.updater.run()).toEqual({ type: "available", version: "def5678" })
    expect(available.commands.some((command) => command.includes("pull"))).toBe(false)

    const disabled = yield* fixture(repository({ behind: "1" }))
    yield* disabled.fs.makeDirectory(disabled.global.config, { recursive: true })
    yield* disabled.fs.writeFileString(path.join(disabled.global.config, "opencode.json"), '{ "update": "disable" }')
    expect(yield* disabled.updater.run()).toBeUndefined()
    expect(disabled.commands).toEqual([])
  }),
)

test("a compiled build runs no git and explains how HIPS Code updates", async () => {
  const child = Bun.spawn(
    [
      process.execPath,
      "test",
      import.meta.path,
      "--define",
      'OPENCODE_CHANNEL="latest"',
      "--test-name-pattern",
      "^compiled build has no checkout to update$",
    ],
    {
      cwd: path.join(import.meta.dir, ".."),
      stdout: "ignore",
      stderr: "pipe",
      // Bun 1.4 can reuse cached modules compiled with different --define values.
      env: { ...process.env, BUN_RUNTIME_TRANSPILER_CACHE_PATH: "0" },
    },
  )
  const [code, stderr] = await Promise.all([child.exited, new Response(child.stderr).text()])
  expect(code, stderr).toBe(0)
  expect(stderr).toContain("1 pass")
})

if (typeof OPENCODE_CHANNEL === "string" && OPENCODE_CHANNEL === "latest") {
  it.live("compiled build has no checkout to update", () =>
    Effect.gen(function* () {
      const test = yield* fixture(repository({ behind: "1" }))
      expect(yield* test.updater.checkout()).toBeUndefined()
      expect(yield* test.updater.check()).toEqual({ type: "unavailable", message: Updater.unavailable })
      expect(yield* test.updater.run()).toBeUndefined()
      expect(Updater.unavailable).toBe("HIPS Code updates from its git checkout, and this build does not run from one.")
      expect(test.commands).toEqual([])
    }),
  )
}

it.live("vp removes the package from its managed global store", () =>
  Effect.gen(function* () {
    const test = yield* fixture()
    const removal = test.updater.removal("vp")
    if (!removal) return yield* Effect.die("Expected vp removal command")
    expect(removal.command).toEqual(["vp", "uninstall", "-g", "@opencode/cli"])
    yield* removal.run
    expect(test.commands).toEqual([["vp", "uninstall", "-g", "@opencode/cli"]])
  }),
)
;(["npm", "pnpm", "bun", "yarn", "vp", undefined] as const).forEach((method) => {
  it.live(`method detection identifies ${method ?? "an unknown installation"} using the V2 package`, () =>
    Effect.gen(function* () {
      const test = yield* fixture((command) => ({
        stdout: Buffer.from(
          command.command === method
            ? method === "vp"
              ? JSON.stringify([{ name: "@opencode/cli", version: "2.3.4" }])
              : "@opencode/cli@2.3.4"
            : command.command === "vp"
              ? "[]"
              : "opencode-ai@1.0.0",
        ),
      }))
      expect(yield* test.updater.method()).toBe(method)
      expect(test.commands).toEqual([
        ["npm", "list", "-g", "--depth=0", "@opencode/cli"],
        ["pnpm", "list", "-g", "--depth=0", "@opencode/cli"],
        ["bun", "pm", "ls", "-g"],
        ["yarn", "global", "list"],
        ["vp", "list", "-g", "--json", "@opencode/cli"],
      ])
    }),
  )
})

it.live("method detection tolerates unavailable package managers", () =>
  Effect.gen(function* () {
    const test = yield* fixture((command) =>
      command.command === "yarn"
        ? { stdout: Buffer.from("@opencode/cli@2.3.4") }
        : { error: new AppProcess.AppProcessError({ command: command.command }) },
    )
    expect(yield* test.updater.method()).toBe("yarn")
    expect(test.commands).toHaveLength(5)
  }),
)

it.live("vp detection ignores no-match output that repeats the package name", () =>
  Effect.gen(function* () {
    const test = yield* fixture((command) => ({
      stdout: Buffer.from(command.command === "vp" ? "No global packages matching '@opencode/cli'." : ""),
    }))
    expect(yield* test.updater.method()).toBeUndefined()
  }),
)

it.live("Homebrew Core and tap installs are detected but not removed by uninstall", () =>
  Effect.gen(function* () {
    yield* Effect.forEach(["opencode", "opencode-v2", "opencode-beta"], (formula) =>
      Effect.gen(function* () {
        const test = yield* fixture(() => ({}), "@opencode/cli", formula)
        expect(yield* test.updater.method()).toBe("brew")
        expect(test.updater.removal("brew")).toBeUndefined()
        expect(test.commands).toEqual([])
      }),
    )
  }),
)

const winget = () =>
  fixture(
    () => ({}),
    "@opencode/cli",
    undefined,
    (root) =>
      Effect.succeed(
        path.join(
          root,
          "AppData",
          "Local",
          "Microsoft",
          "WinGet",
          "Packages",
          "Anomaly.OpenCode_Microsoft.Winget.Source_8wekyb3d8bbwe",
          "opencode.exe",
        ),
      ),
  )
const wingetArgs = [
  "--id",
  "Anomaly.OpenCode",
  "--exact",
  "--source",
  "winget",
  "--accept-source-agreements",
  "--disable-interactivity",
]

it.live("WinGet installs are detected and removed through WinGet", () =>
  Effect.gen(function* () {
    const test = yield* winget()
    expect(yield* test.updater.method()).toBe("winget")
    const removal = test.updater.removal("winget")
    if (!removal) return yield* Effect.die("Expected winget removal command")
    yield* removal.run
    expect(test.commands).toEqual([["winget", "uninstall", ...wingetArgs]])
  }),
)

// Links are named opencode-upgrade-<pid>-<random>.exe; read them from inside the package manager run.
const links = (directory: string) =>
  existsSync(directory) ? readdirSync(directory).filter((name) => name.startsWith("opencode-")) : []
const upgradeLinks = (directory: string) =>
  links(directory).filter((name) => name.startsWith(`opencode-upgrade-${process.pid}-`))

windows("windows keeps the uninstall link in the temporary directory, not the removed cache", () =>
  Effect.gen(function* () {
    const layout = { tmp: "" }
    const test = yield* fixture(() => {
      expect(upgradeLinks(layout.tmp)).toHaveLength(1)
      return {}
    })
    layout.tmp = test.global.tmp
    yield* test.fs.makeDirectory(test.global.cache, { recursive: true })
    const removal = test.updater.removal("bun")
    if (!removal) return yield* Effect.die("Expected bun removal command")
    yield* removal.run
    expect(test.commands).toEqual([["bun", "remove", "--global", "@opencode/cli"]])
    expect(links(test.global.cache)).toEqual([])
    expect(links(test.global.tmp)).toEqual([])
  }),
)

unix("curl method detection resolves symlinked home directories", () =>
  Effect.gen(function* () {
    const test = yield* fixture(
      () => ({}),
      "@opencode/cli",
      undefined,
      (root, home) =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem
          const realHome = path.join(root, "real-home")
          const bin = path.join(realHome, ".opencode", "bin", "opencode")
          yield* fs.makeDirectory(path.dirname(bin), { recursive: true })
          yield* fs.symlink(realHome, home)
          return bin
        }),
    )
    expect(yield* test.updater.method()).toBe("curl")
    expect(test.commands).toEqual([])
  }),
)

test("Node distribution honors the compile-time CLI name", async () => {
  const child = Bun.spawn(
    [
      process.execPath,
      "test",
      import.meta.path,
      "--define",
      'OPENCODE_CLI_NAME="opencode2-node"',
      "--test-name-pattern",
      "^Node distribution detects the published npm package$",
    ],
    {
      cwd: path.join(import.meta.dir, ".."),
      stdout: "ignore",
      stderr: "pipe",
      // Bun 1.4 can reuse cached modules compiled with different --define values.
      env: { ...process.env, BUN_RUNTIME_TRANSPILER_CACHE_PATH: "0" },
    },
  )
  const [code, stderr] = await Promise.all([child.exited, new Response(child.stderr).text()])
  expect(code, stderr).toBe(0)
  expect(stderr).toContain("1 pass")
})

if (typeof OPENCODE_CLI_NAME === "string" && OPENCODE_CLI_NAME === "opencode2-node") {
  it.live("Node distribution detects the published npm package", () =>
    Effect.gen(function* () {
      const test = yield* fixture(
        (command) => ({
          stdout: Buffer.from(command.command === "npm" ? "@opencode/cli-node@2.3.4" : ""),
        }),
        "@opencode/cli-node",
      )
      expect(yield* test.updater.method()).toBe("npm")
      expect(test.updater.removal("npm")?.command).toEqual(["npm", "uninstall", "--global", "@opencode/cli-node"])
    }),
  )
}
