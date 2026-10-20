import { expect, test } from "bun:test"
import type { RGBA } from "@opentui/core"
import {
  migrateV1,
  parseThemeDocument,
  resolveTheme,
  resolveThemeDocument,
  selectTheme,
  type ResolvedThemeTokens,
} from "../src/tui/index.js"
import type { ThemeV1Json } from "../src/tui/v1.js"

const source: ThemeV1Json = await Bun.file(
  new URL("../../tui/src/theme/assets/opencode.json", import.meta.url),
).json()
const document = migrateV1(source)
const native = parseThemeDocument(
  await Bun.file(new URL("../../tui/src/theme/assets/v2/opencode.json", import.meta.url)).json(),
  "opencode",
)

const brand = {
  dark: { mark: "#0089dd", markShade: "#005f9e", markAccent: "#81bd41", markEyes: "#edf3f5" },
  light: { mark: "#007dbb", markShade: "#00547e", markAccent: "#5e9a2a", markEyes: "#edf3f5" },
}

const hex = (color: RGBA) =>
  `#${color
    .toInts()
    .slice(0, 3)
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("")}`

const marks = (theme: ResolvedThemeTokens) =>
  Object.fromEntries(Object.entries(theme.brand).map(([token, color]) => [token, hex(color)]))

test.each(["light", "dark"] as const)("resolves %s themes without status tokens", (mode) => {
  const theme = resolveThemeDocument(document, mode)
  expect("status" in theme.text).toBeFalse()
  expect(theme.hue.accent[800]).toBeDefined()
  expect(theme.hue.interactive[800]).toBeDefined()
})

test.each(["light", "dark"] as const)("gives a %s theme without brand tokens the brand mark defaults", (mode) => {
  expect(marks(resolveThemeDocument(native, mode))).toEqual(brand[mode])
  expect(marks(resolveThemeDocument(native, mode).surface("dialog"))).toEqual(brand[mode])
})

test.each(["light", "dark"] as const)("gives a migrated V1 %s theme the brand mark defaults", (mode) => {
  expect(marks(resolveThemeDocument(document, mode))).toEqual(brand[mode])
})

test("keeps explicit brand tokens and defaults the rest", () => {
  const custom = parseThemeDocument(
    { ...native, base: { ...native.base, brand: { mark: "#123456", markAccent: "$hue.interactive.200" } } },
    "custom",
  )
  const theme = resolveThemeDocument(custom, "dark")
  expect(marks(theme)).toEqual({ ...brand.dark, mark: "#123456", markAccent: hex(theme.hue.interactive[200]) })
})

test.each(["light", "dark"] as const)("infers the %s brand defaults for a bare theme definition", (mode) => {
  expect(marks(resolveTheme(selectTheme(native, mode)))).toEqual(brand[mode])
})
