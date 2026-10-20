import { Global } from "@opencode/util/global"
import { AppProcess } from "@opencode/util/process"
import { EffectFlock } from "@opencode/util/effect-flock"
import { OPENCODE_LOCAL } from "../version"
import { Context, Duration, Effect, FileSystem, Layer, Option, Schema } from "effect"
import { ChildProcess } from "effect/process"
import { parse, type ParseError } from "jsonc-parser"
import path from "node:path"
import { stripVTControlCharacters } from "node:util"
import { RetainedImage } from "./retained-image"
import { errorMessage } from "../util/error"

export const methods = ["curl", "npm", "pnpm", "bun", "yarn", "vp", "brew", "winget"] as const

export type Method = (typeof methods)[number]
export type Policy = "disable" | "notify" | "auto"
export type RunResult = { readonly type: "available"; readonly version: string }
export type CheckResult = RunResult | { readonly type: "unavailable"; readonly message: string }
export type UpgradeResult = { readonly from: string; readonly to: string }

export const unavailable = "HIPS Code updates from its git checkout, and this build does not run from one."

export class UpgradeError extends Error {
  readonly title: string
  readonly detail: string
  readonly command?: string
  readonly retry: string

  constructor(
    input: {
      readonly title: string
      readonly detail: string
      readonly command?: string
      readonly retry: string
    },
    options?: ErrorOptions,
  ) {
    super(input.detail, options)
    this.name = "UpgradeError"
    this.title = input.title
    this.detail = input.detail
    this.command = input.command
    this.retry = input.retry
  }
}

const decodeVpPackages = Schema.decodeUnknownOption(
  Schema.fromJsonString(Schema.Array(Schema.Struct({ name: Schema.String }))),
)

const wingetPackage = "Anomaly.OpenCode"
const wingetArgs = [
  "--id",
  wingetPackage,
  "--exact",
  "--source",
  "winget",
  "--accept-source-agreements",
  "--disable-interactivity",
]

function conciseDetail(input: string) {
  const lines = stripVTControlCharacters(input)
    .trim()
    .replaceAll("\r", "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0)
  const tail = lines.slice(-12).join("\n")
  const clipped = tail.length > 2_000
  const detail = clipped ? `…${tail.slice(-1_999)}` : tail
  if (!detail) return
  if (lines.length <= 12 && !clipped) return detail
  return `${detail}\n\nOutput shortened to the last 12 lines.`
}

function errorDetail(cause: unknown): string {
  if (cause instanceof AppProcess.AppProcessError) {
    const stderr = conciseDetail(cause.stderr ?? "")
    if (stderr) return stderr
    if (cause.cause !== undefined) return errorDetail(cause.cause)
    return cause.message
  }
  if (cause instanceof Error) {
    const detail = cause.cause === undefined ? undefined : errorDetail(cause.cause)
    if (!detail || detail === cause.message) return cause.message
    return `${cause.message}: ${detail}`
  }
  return errorMessage(cause)
}

function resultDetail(result: { code: number; stdout: string; stderr: string }) {
  return (
    conciseDetail(result.stderr) ??
    conciseDetail(result.stdout) ??
    `The command exited with code ${result.code} without any error output.`
  )
}

export interface Interface {
  readonly run: () => Effect.Effect<RunResult | undefined>
  readonly check: () => Effect.Effect<CheckResult | undefined, Error>
  readonly checkout: () => Effect.Effect<string | undefined>
  readonly upgrade: (root: string) => Effect.Effect<UpgradeResult, UpgradeError>
  readonly method: () => Effect.Effect<Method | undefined>
  readonly removal: (
    method: Method,
  ) => { readonly command: ReadonlyArray<string>; readonly run: Effect.Effect<void, Error> } | undefined
}

export class Service extends Context.Service<Service, Interface>()("@opencode/cli/Updater") {}

export function decodePolicy(text: string): Policy | undefined {
  // The CLI only projects this host-level preference instead of initializing
  // the location-scoped server configuration graph.
  const errors: ParseError[] = []
  const input: unknown = parse(text, errors, { allowTrailingComma: true })
  if (errors.length || typeof input !== "object" || input === null) return
  if ("update" in input) {
    const value = input.update
    if (value === "disable" || value === "notify" || value === "auto") return value
    return
  }
  if (!("autoupdate" in input)) return
  if (input.autoupdate === false) return "disable"
  if (input.autoupdate === "notify") return "notify"
  if (input.autoupdate === true) return "auto"
}

const make = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem
  const global = yield* Global.Service
  const appProcess = yield* AppProcess.Service
  const flock = yield* EffectFlock.Service
  const executable = yield* fs.realPath(process.execPath).pipe(Effect.orElseSucceed(() => process.execPath))
  const installedPackage = yield* Effect.gen(function* () {
    const directory = path.dirname(path.dirname(executable))
    const manifest: { name: string; bin?: Record<string, string> } = yield* fs
      .readFileString(path.join(directory, "package.json"))
      .pipe(Effect.flatMap((text) => Effect.try(() => JSON.parse(text))))
    // Source invocations run inside Bun or Node, which may themselves be npm packages.
    if (!/^@opencode(?:-ai)?\/cli(?:-node)?$/.test(manifest.name)) return
    if (Object.values(manifest.bin ?? {}).some((bin) => path.resolve(directory, bin) === executable))
      return manifest.name
  }).pipe(Effect.orElseSucceed(() => undefined))
  // "opencode" is Homebrew Core's formula; the others are published to anomalyco/tap.
  const installedFormula = ["opencode", "opencode-beta", "opencode-v2"].find((name) =>
    executable.includes(`${path.sep}Cellar${path.sep}${name}${path.sep}`),
  )
  // WinGet extracts portable packages into a directory named after the package identifier.
  const installedWinget = /[\\/]winget[\\/]packages[\\/]anomaly\.opencode_/i.test(executable)

  const readPolicy = Effect.fnUntraced(function* () {
    const values = yield* Effect.forEach(["config.json", "opencode.json", "opencode.jsonc"], (name) =>
      fs.readFileString(path.join(global.config, name)).pipe(
        Effect.map(decodePolicy),
        Effect.orElseSucceed(() => undefined),
      ),
    )
    return values.findLast((value) => value !== undefined) ?? "notify"
  })

  const exec = Effect.fnUntraced(function* (
    command: string[],
    timeout: Duration.Input = "30 seconds",
    options?: ChildProcess.CommandOptions,
  ) {
    return yield* appProcess
      .run(ChildProcess.make(command[0], command.slice(1), options), {
        timeout,
        maxOutputBytes: 100_000,
        maxErrorBytes: 100_000,
      })
      .pipe(
        Effect.map((result) => ({
          code: result.exitCode,
          stdout: result.stdout.toString("utf8"),
          stderr: result.stderr.toString("utf8"),
        })),
      )
  })

  const curlPath = path.resolve(
    global.home,
    ".opencode",
    "bin",
    process.platform === "win32" ? "opencode.exe" : "opencode",
  )
  const curlBinary = yield* fs.realPath(curlPath).pipe(Effect.orElseSucceed(() => curlPath))

  const method = Effect.fnUntraced(function* () {
    if (executable === curlBinary) return "curl"
    if (installedFormula) return "brew"
    if (installedWinget) return "winget"
    if (!installedPackage) return

    const parts = executable.toLowerCase().split(path.sep).map((part) => part.replace(/^\./, ""))
    const checks: Array<{ method: Method; command: string[] }> = [
      { method: "npm", command: ["npm", "list", "-g", "--depth=0", installedPackage] },
      { method: "pnpm", command: ["pnpm", "list", "-g", "--depth=0", installedPackage] },
      { method: "bun", command: ["bun", "pm", "ls", "-g"] },
      { method: "yarn", command: ["yarn", "global", "list"] },
      { method: "vp", command: ["vp", "list", "-g", "--json", installedPackage] },
    ]
    checks.sort((a, b) => Number(parts.includes(b.method)) - Number(parts.includes(a.method)))
    const results = yield* Effect.forEach(
      checks,
      (check) =>
        exec(check.command).pipe(
          Effect.orElseSucceed(() => ({ code: 1, stdout: "", stderr: "" })),
          Effect.map((result) => ({ check, result })),
        ),
      { concurrency: "unbounded" },
    )
    return results.find((result) => {
      if (result.check.method !== "vp") return result.result.stdout.includes(installedPackage)
      // Vite+ repeats the filter in its successful no-match message, so substring detection would be a false positive.
      return Option.exists(decodeVpPackages(result.result.stdout), (packages) =>
        packages.some((item) => item.name === installedPackage),
      )
    })?.check.method
  })

  const removalCommand = (method: Method) => {
    if (method === "winget") return ["winget", "uninstall", ...wingetArgs]
    if (method === "curl" || method === "brew" || !installedPackage) return undefined
    const commands = {
      npm: ["npm", "uninstall", "--global", installedPackage],
      pnpm: ["pnpm", "remove", "--global", installedPackage],
      bun: ["bun", "remove", "--global", installedPackage],
      yarn: ["yarn", "global", "remove", installedPackage],
      vp: ["vp", "uninstall", "-g", installedPackage],
    }
    return commands[method]
  }

  const removal = (method: Method) => {
    const command = removalCommand(method)
    if (!command) return undefined
    return {
      command,
      run: retaining(
        method,
        exec(command, "5 minutes").pipe(
          Effect.flatMap((result) => (result.code === 0 ? Effect.void : Effect.fail(new Error(resultDetail(result))))),
        ),
      ),
    }
  }

  // On Windows the package manager must delete the running binary, which only works while
  // another link to it exists (see RetainedImage). Uninstall has already removed the cache,
  // so the link lives in the temporary directory.
  const retaining = <A, E, R>(method: Method, effect: Effect.Effect<A, E, R>) => {
    if (process.platform !== "win32" || method === "brew") return effect
    // Only the installed binary is at stake; source checkouts run inside bun or node.
    const owned =
      method === "curl"
        ? executable === curlBinary
        : method === "winget"
          ? installedWinget
          : installedPackage !== undefined
    if (!owned) return effect
    return Effect.scoped(RetainedImage.retain(global.tmp, "upgrade").pipe(Effect.andThen(effect))).pipe(
      Effect.provideService(FileSystem.FileSystem, fs),
    )
  }

  const git = (root: string, args: string[], title: string, timeout?: Duration.Input) =>
    step({
      command: ["git", "-C", root, ...args],
      title,
      timeout,
      // A credential prompt would block the update and draw over the TUI.
      options: { env: { GIT_TERMINAL_PROMPT: "0" }, extendEnv: true },
    })

  const step = (input: {
    readonly command: string[]
    readonly title: string
    readonly retry?: string
    readonly timeout?: Duration.Input
    readonly options?: ChildProcess.CommandOptions
  }) => {
    const failure = (detail: string, cause?: unknown) =>
      new UpgradeError(
        {
          title: input.title,
          detail,
          command: input.command.join(" "),
          retry: input.retry ?? "Fix the issue above, then run opencode upgrade again.",
        },
        cause === undefined ? undefined : { cause },
      )
    return exec(input.command, input.timeout, input.options).pipe(
      Effect.mapError((cause) => failure(errorDetail(cause), cause)),
      Effect.flatMap((result) =>
        result.code === 0 ? Effect.succeed(result.stdout.trim()) : Effect.fail(failure(resultDetail(result))),
      ),
    )
  }

  const checkout = Effect.fn("cli.updater.checkout")(function* () {
    if (!OPENCODE_LOCAL) return undefined
    // The checkout that holds this source file, wherever the user started the CLI from.
    const result = yield* exec(["git", "-C", import.meta.dirname, "rev-parse", "--show-toplevel"]).pipe(
      Effect.option,
    )
    if (Option.isNone(result) || result.value.code !== 0) return undefined
    return result.value.stdout.trim() || undefined
  })

  const upgrade = Effect.fn("cli.updater.upgrade")(function* (root: string) {
    return yield* Effect.scoped(
      Effect.gen(function* () {
        // The TUI and the upgrade command may pull the same checkout at the same time.
        yield* flock.acquire("cli-upgrade", undefined, { timeoutMs: Duration.toMillis("15 minutes") })
        const title = "Could not pull HIPS Code updates"
        const from = yield* git(root, ["rev-parse", "--short", "HEAD"], title)
        yield* git(root, ["pull", "--ff-only"], title, "5 minutes")
        const to = yield* git(root, ["rev-parse", "--short", "HEAD"], title)
        if (from === to) return { from, to }
        yield* step({
          command: [process.versions.bun ? process.execPath : "bun", "install"],
          title: `Pulled ${from} → ${to}, but bun install failed`,
          retry: `Run bun install in ${root}, then start HIPS Code again.`,
          timeout: "5 minutes",
          options: { cwd: root },
        })
        return { from, to }
      }),
    ).pipe(
      Effect.mapError((cause) =>
        cause instanceof UpgradeError
          ? cause
          : new UpgradeError(
              {
                title: "Could not prepare the HIPS Code upgrade",
                detail: errorDetail(cause),
                retry: "Fix the issue above, then run opencode upgrade again.",
              },
              { cause },
            ),
      ),
    )
  })

  const check = Effect.fn("cli.updater.check")(function* () {
    const root = yield* checkout()
    if (!root) return { type: "unavailable" as const, message: unavailable }
    const title = "Could not check for HIPS Code updates"
    yield* git(root, ["fetch", "--quiet"], title, "1 minute")
    const behind = yield* git(root, ["rev-list", "--count", "HEAD..@{upstream}"], title)
    if (Number(behind) === 0) return undefined
    return { type: "available" as const, version: yield* git(root, ["rev-parse", "--short", "@{upstream}"], title) }
  })

  const background = Effect.fn("cli.updater.run")(
    function* () {
      if (["1", "true"].includes(process.env.OPENCODE_DISABLE_AUTOUPDATE?.toLowerCase() ?? "")) return undefined
      if ((yield* readPolicy()) === "disable") return undefined
      // Background checks only notify; pulling a checkout always waits for the user.
      const result = yield* check()
      return result?.type === "available" ? result : undefined
    },
    Effect.catch((error) => Effect.logWarning("update check failed", { error }).pipe(Effect.as(undefined))),
  )

  return Service.of({ run: background, check, checkout, upgrade, method, removal })
})

export const layer = Layer.effect(Service, make)

export * as Updater from "./updater"
