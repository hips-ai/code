import { intro, log, outro, spinner } from "@clack/prompts"
import { Effect } from "effect"
import { Commands } from "../commands"
import { Runtime } from "../../framework/runtime"
import { ServerConnection } from "../../services/server-connection"
import { Updater } from "../../services/updater"
import { handlePromptErrors } from "../../ui/prompt"
import { stripVTControlCharacters } from "node:util"

export default Runtime.handler(
  Commands.commands.upgrade,
  Effect.fn("cli.upgrade")(
    function* () {
      intro("Upgrade")
      const updater = yield* Updater.Service
      const root = yield* updater.checkout()
      if (!root) {
        log.info(Updater.unavailable)
        outro("Done")
        return
      }

      log.info(`Checkout: ${root}`)
      const progress = spinner()
      progress.start("Pulling with git...")
      const result = yield* updater
        .upgrade(root)
        .pipe(Effect.tapCause(() => Effect.sync(() => progress.stop("Upgrade failed", 1))))
      if (result.from === result.to) {
        progress.stop(`Already up to date at ${result.to}`)
        outro("Done")
        return
      }
      progress.stop(`Updated ${result.from} → ${result.to}`)

      progress.start("Restarting the background service...")
      const restarted = yield* ServerConnection.restart().pipe(
        Effect.tapCause(() => Effect.sync(() => progress.stop("Could not restart the background service", 1))),
      )
      progress.stop(restarted ? "Background service restarted" : "No background service was running")
      outro("Done")
    },
    (effect) =>
      handlePromptErrors(
        effect.pipe(
          Effect.mapError((error) =>
            error instanceof Updater.UpgradeError ? new Error(formatUpgradeError(error), { cause: error }) : error,
          ),
        ),
      ),
  ),
)

function formatUpgradeError(error: Updater.UpgradeError) {
  const clean = (value: string) => stripVTControlCharacters(value).replaceAll("\r", "").trim()
  const line = (value: string) => clean(value).replace(/\s+/g, " ")
  const detail = wrap(clean(error.detail), Math.max(24, (process.stdout.columns ?? 80) - 7)).join("\n")
  return [
    line(error.title),
    "",
    detail,
    ...(error.command ? ["", field("Command", line(error.command))] : []),
    field("Retry", line(error.retry)),
  ].join("\n")
}

function field(label: string, value: string) {
  const prefix = label.padEnd(9)
  const width = Math.max(24, Math.min(61, (process.stdout.columns ?? 80) - prefix.length - 10))
  const lines = wrap(value, width)
  return lines.map((line, index) => `${index === 0 ? prefix : " ".repeat(prefix.length)}${line}`).join("\n")
}

function wrap(value: string, width: number) {
  return value.split("\n").flatMap((source) => {
    if (source.length <= width) return [source]
    return source.split(/\s+/).reduce<string[]>((result, word) => {
      const index = result.length - 1
      if (index < 0 || result[index].length + word.length + 1 > width) result.push(word)
      else result[index] += ` ${word}`
      return result
    }, [])
  })
}
