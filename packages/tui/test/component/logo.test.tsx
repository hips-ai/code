/** @jsxImportSource @opentui/solid */
import { expect, test } from "bun:test"
import type { RGBA } from "@opentui/core"
import { testRender } from "@opentui/solid"
import { Logo } from "../../src/component/logo"
import { ConfigProvider } from "../../src/config"
import { ThemeProvider } from "../../src/context/theme"
import { emptyThemeSource } from "../fixture/fixture"
import { TestTuiContexts } from "../fixture/tui-environment"
import { createTuiResolvedConfig } from "../fixture/tui-runtime"

async function render(width: number, height = 20, theme = { name: "opencode", mode: "dark" as "dark" | "light" }) {
  const app = await testRender(
    () => (
      <TestTuiContexts>
        <ConfigProvider config={createTuiResolvedConfig({ theme })}>
          <ThemeProvider mode={theme.mode} source={emptyThemeSource}>
            <Logo />
          </ThemeProvider>
        </ConfigProvider>
      </TestTuiContexts>
    ),
    { width, height },
  )
  try {
    await app.renderOnce()
    return {
      rows: app
        .captureCharFrame()
        .split("\n")
        .map((line) => line.trimEnd())
        .filter(Boolean),
      spans: app.captureSpans().lines.flatMap((line) => line.spans),
    }
  } finally {
    app.renderer.destroy()
  }
}

const frame = async (width: number, height?: number) => (await render(width, height)).rows

const hex = (color: RGBA) =>
  `#${color
    .toInts()
    .slice(0, 3)
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("")}`

const mascotAndWordmark = [
  "    ▄▀▄▄    ▄    ▀                        ▄",
  " ▄██▀██▀█   █▀▀▄ █ █▀▀█ █▀▀▀ █▀▀▀ █▀▀█ █▀▀█ █▀▀█",
  "▀▀██▀██▀█▀  █  █ █ █  █ ▀▀▀█ █    █  █ █  █ █▀▀▀",
  "   ▀▀▀█▀    ▀▀▀▀ ▀ █▀▀▀ ▀▀▀▀ ▀▀▀▀ ▀▀▀▀ ▀▀▀▀ ▀▀▀▀",
]

const wordmark = [
  "▄    ▀                        ▄",
  "█▀▀▄ █ █▀▀█ █▀▀▀ █▀▀▀ █▀▀█ █▀▀█ █▀▀█",
  "█  █ █ █  █ ▀▀▀█ █    █  █ █  █ █▀▀▀",
  "▀▀▀▀ ▀ █▀▀▀ ▀▀▀▀ ▀▀▀▀ ▀▀▀▀ ▀▀▀▀ ▀▀▀▀",
]

const hips = ["▄    ▀", "█▀▀▄ █ █▀▀█ █▀▀▀", "█  █ █ █  █ ▀▀▀█", "▀▀▀▀ ▀ █▀▀▀ ▀▀▀▀"]

const stacked = [...hips, "             ▄", "█▀▀▀ █▀▀█ █▀▀█ █▀▀█", "█    █  █ █  █ █▀▀▀", "▀▀▀▀ ▀▀▀▀ ▀▀▀▀ ▀▀▀▀"]

test.each([
  [80, mascotAndWordmark],
  [56, mascotAndWordmark],
  [55, wordmark],
  [40, wordmark],
  [39, stacked],
  [22, stacked],
  [21, hips],
  [16, hips],
  [15, []],
])("width %i renders the matching logo layout", async (width, expected) => {
  expect(await frame(width)).toEqual(expected)
})

test("hides the logo in short terminals", async () => {
  expect(await frame(80, 11)).toEqual([])
})

test.each([
  ["opencode", "dark", { mark: "#0089dd", markShade: "#005f9e", markAccent: "#81bd41", markEyes: "#edf3f5" }],
  ["tokyonight", "light", { mark: "#007dbb", markShade: "#00547e", markAccent: "#5e9a2a", markEyes: "#edf3f5" }],
  ["hips", "dark", { mark: "#0089dd", markShade: "#005f9e", markAccent: "#81bd41", markEyes: "#edf3f5" }],
] as const)("draws the mark in brand colors under the %s %s theme", async (name, mode, brand) => {
  const result = await render(80, 20, { name, mode })
  const colors = new Set(result.spans.flatMap((span) => [hex(span.fg), ...(span.bg.a > 0 ? [hex(span.bg)] : [])]))
  for (const color of Object.values(brand)) expect(colors).toContain(color)
  const dot = result.spans.find((span) => span.text.trim() === "▀" && hex(span.fg) === brand.markAccent)
  expect(dot).toBeDefined()
  const letters = result.spans.filter((span) => span.text.includes("█▀▀▄"))
  expect(letters.map((span) => hex(span.fg))).toEqual([brand.mark])
})
