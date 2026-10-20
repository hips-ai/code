import { NodeServices } from "@effect/platform-node"
import { Global } from "@opencode/util/global"
import { Effect } from "effect"
import { Command } from "effect/cli"
import { Commands } from "../../src/commands/commands"
import upgrade from "../../src/commands/handlers/upgrade"
import { Updater } from "../../src/services/updater"

const record = (event: unknown) => console.log(`EVENT ${JSON.stringify(event)}`)

await Effect.runPromise(
  Command.runWith(Commands.commands.upgrade.spec.pipe(Command.withHandler(upgrade)), { version: "test" })(
    process.argv.slice(2),
  ).pipe(
    Effect.provideService(Updater.Service, {
      run: () => Effect.die("Manual upgrades must not check for automatic updates"),
      check: () => Effect.die("Manual upgrades must not check for TUI updates"),
      removal: () => undefined,
      method: () => Effect.die("Manual upgrades must not detect a package manager"),
      checkout: () =>
        Effect.sync(() => {
          record("checkout")
          return process.env.UPGRADE_TEST_PULL === "compiled" ? undefined : "/checkout"
        }),
      upgrade: (root) =>
        Effect.suspend(() => {
          record({ upgrade: root })
          if (process.env.UPGRADE_TEST_PULL === "diverged")
            return Effect.fail(
              new Updater.UpgradeError({
                title: "Could not pull HIPS Code updates",
                detail: "fatal: Not possible to fast-forward, aborting.",
                command: "git -C /checkout pull --ff-only",
                retry: "Fix the issue above, then run opencode upgrade again.",
              }),
            )
          return Effect.succeed({
            from: "abc1234",
            to: process.env.UPGRADE_TEST_PULL === "current" ? "abc1234" : "def5678",
          })
        }),
    }),
    Effect.provide(Global.layerWith({})),
    Effect.provide(NodeServices.layer),
  ),
)
