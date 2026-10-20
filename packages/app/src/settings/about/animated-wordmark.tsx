import { Logo } from "@opencode/ui/logo"

export function AnimatedWordmark(props: { active: boolean }) {
  return (
    <div class="settings-about-wordmark" data-active={props.active ? "" : undefined} aria-hidden="true">
      <Logo />
    </div>
  )
}
