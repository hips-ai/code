import { RGBA, TextAttributes } from "@opentui/core"
import { For, Show, type JSX } from "solid-js"
import { useTerminalDimensions } from "@opentui/solid"
import { useTheme } from "../context/theme"
import { tint } from "../theme/color"
import { logo, mascot } from "../logo"

export function Logo() {
  const theme = useTheme()
  const dimensions = useTerminalDimensions()

  const renderLine = (line: string, fg: RGBA, bold: boolean): JSX.Element[] => {
    const shadow = tint(theme.background.base, fg, 0.25)
    const attrs = bold ? TextAttributes.BOLD : undefined
    return Array.from(line).map((char) => {
      if (char === "_") {
        return (
          <text fg={fg} bg={shadow} attributes={attrs} selectable={false}>
            {" "}
          </text>
        )
      }
      if (char === "^") {
        return (
          <text fg={fg} bg={shadow} attributes={attrs} selectable={false}>
            ▀
          </text>
        )
      }
      if (char === "~") {
        return (
          <text fg={shadow} attributes={attrs} selectable={false}>
            ▀
          </text>
        )
      }
      if (char === "*") {
        return (
          <text fg={theme.brand.markAccent} attributes={attrs} selectable={false}>
            ▀
          </text>
        )
      }
      return (
        <text fg={fg} attributes={attrs} selectable={false}>
          {char}
        </text>
      )
    })
  }

  // Each cell carries two mascot pixels: the top one as a foreground half block, the bottom one as its background.
  const renderMascot = (row: number): JSX.Element[] => {
    const pixels: Record<string, RGBA | undefined> = {
      m: theme.brand.mark,
      s: theme.brand.markShade,
      e: theme.brand.markEyes,
      a: theme.brand.markAccent,
    }
    const bottom = Array.from(mascot[row * 2 + 1] ?? "")
    return Array.from(mascot[row * 2] ?? "").map((pixel, column) => {
      const upper = pixels[pixel]
      const lower = pixels[bottom[column] ?? "."]
      if (upper && pixel === bottom[column]) {
        return (
          <text fg={upper} selectable={false}>
            █
          </text>
        )
      }
      if (upper) {
        return (
          <text fg={upper} bg={lower} selectable={false}>
            ▀
          </text>
        )
      }
      if (lower) {
        return (
          <text fg={lower} selectable={false}>
            ▄
          </text>
        )
      }
      return <text selectable={false}> </text>
    })
  }

  return (
    <box>
      {dimensions().height < 12 || dimensions().width < 16 ? null : dimensions().width < 22 ? (
        <For each={logo.left}>
          {(line) => <box flexDirection="row">{renderLine(line, theme.brand.mark, false)}</box>}
        </For>
      ) : dimensions().width < 40 ? (
        <>
          <For each={logo.left}>
            {(line) => <box flexDirection="row">{renderLine(line, theme.brand.mark, false)}</box>}
          </For>
          <For each={logo.right}>
            {(line) => <box flexDirection="row">{renderLine(line, theme.text.base, true)}</box>}
          </For>
        </>
      ) : (
        <For each={logo.left}>
          {(line, index) => (
            <box flexDirection="row" gap={1}>
              <Show when={dimensions().width >= 56}>
                <box flexDirection="row" marginRight={1}>
                  {renderMascot(index())}
                </box>
              </Show>
              <box flexDirection="row">{renderLine(line, theme.brand.mark, false)}</box>
              <box flexDirection="row">{renderLine(logo.right[index()], theme.text.base, true)}</box>
            </box>
          )}
        </For>
      )}
    </box>
  )
}
