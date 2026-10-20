// @ts-nocheck
import * as mod from "./logo"

const docs = `### Overview
HIPS Code logo assets: the HiP mascot mark, splash, the full lockup, and the company logo.

Use Mark for compact spaces, Logo for headers, Splash for hero sections, HipsLogo for company credits.

### API
- \`Mark\`, \`Logo\`, and \`HipsLogo\` accept \`class\`; \`Splash\` also accepts \`ref\`.

### Variants and states
- Mark and Splash show the mascot in a 4:5 box; Logo lays out the mascot, the hips logo and "Code" on a 720 by 129 canvas.

### Behavior
- Pure SVG rendering. The mascot keeps its brand colors in every theme.

### Accessibility
- Provide title/aria-label when logos convey meaning.

### Theming/tokens
- "Code" uses \`currentColor\`. The hips letters switch to the brighter brand blue on dark surfaces through \`--logo-hips-letters\`.

`

export default {
  title: "UI/Logo",
  id: "components-logo",
  component: mod.Logo,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component: docs,
      },
    },
  },
}

export const Basic = {
  render: () => (
    <div style={{ display: "grid", gap: "16px", "align-items": "start" }}>
      <div>
        <div style={{ color: "var(--text-weak)", "font-size": "12px" }}>Mark</div>
        <mod.Mark />
      </div>
      <div>
        <div style={{ color: "var(--text-weak)", "font-size": "12px" }}>Splash</div>
        <mod.Splash class="block w-20 h-25" />
      </div>
      <div>
        <div style={{ color: "var(--text-weak)", "font-size": "12px" }}>Logo</div>
        <mod.Logo class="block w-50" />
      </div>
      <div>
        <div style={{ color: "var(--text-weak)", "font-size": "12px" }}>HipsLogo</div>
        <mod.HipsLogo class="block w-20" />
      </div>
    </div>
  ),
}
