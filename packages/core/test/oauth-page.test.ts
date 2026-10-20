import { describe, expect, test } from "bun:test"
import { OauthCallbackPage } from "../src/oauth/page"

describe("OauthCallbackPage", () => {
  test("escapes bootstrap options embedded in the inline script", () => {
    const html = OauthCallbackPage.bootstrap({
      provider: `xAI</script><script>alert("provider")</script>`,
      tokenPath: `/token</script><script>alert("path")</script>`,
    })

    expect(html.match(/<\/script>/g)).toHaveLength(1)
    expect(html).toContain(`xAI\\u003c/script>\\u003cscript>alert(\\\"provider\\\")\\u003c/script>`)
    expect(html).toContain(`/token\\u003c/script>\\u003cscript>alert(\\\"path\\\")\\u003c/script>`)
  })

  test("names HIPS Code and renders its lockup", () => {
    const html = OauthCallbackPage.success({ provider: "xAI" })

    expect(html).toContain("<title>Authorization successful · HIPS Code</title>")
    expect(html).toContain('aria-label="HIPS Code"')
    expect(html).toContain("HIPS Code is now connected to xAI.")
    expect(html).not.toContain("OpenCode")
  })
})
