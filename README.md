<p align="center">
  <img src="packages/identity/hips-mascot.svg" alt="HiP, the HIPS mascot" width="160">
</p>
<h1 align="center">HIPS Code</h1>
<p align="center">The AI coding agent from HIPS, for the terminal and the desktop.</p>

---

HIPS Code is a fork of [OpenCode](https://github.com/anomalyco/opencode) with custom modifications by HIPS. It is not built by the OpenCode team and is not affiliated with them.

### Running from source

HIPS Code runs on [Bun](https://bun.sh) 1.4.2.

```bash
git clone https://github.com/hips-ai/code.git hips-code
cd hips-code
bun install

bun run dev                   # start in the current directory
bun run dev /path/to/project  # start in another project
bun run dev:desktop           # start the desktop app
```

To start HIPS Code from any directory, put a small launcher on your `PATH`, for example `~/.local/bin/hips`:

```sh
#!/bin/sh
HIPS_CODE_DIR="$HOME/hips-code"
exec bun --config="$HIPS_CODE_DIR/packages/cli/bunfig.toml" "$HIPS_CODE_DIR/packages/cli/src/index.ts" "$@"
```

Then `chmod +x ~/.local/bin/hips` and run `hips` inside any project. It always runs the source in your checkout, so changes take effect the next time you start it.

### Agents

HIPS Code includes two built-in agents you can switch between with the `Tab` key.

- **build** - Default, full-access agent for development work
- **plan** - Read-only agent for analysis and code exploration
  - Denies file edits by default
  - Asks permission before running bash commands
  - Ideal for exploring unfamiliar codebases or planning changes

Also included is a **general** subagent for complex searches and multistep tasks.
This is used internally and can be invoked using `@general` in messages.

### Configuration

HIPS Code reads the same configuration as OpenCode (`opencode.json` and the `.opencode` directory), so the [OpenCode documentation](https://opencode.ai/docs) applies to agents, providers, tools and themes.

### License

MIT, the same as OpenCode. See [LICENSE](./LICENSE).
