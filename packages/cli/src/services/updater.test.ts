import { describe, expect, test } from "bun:test"
import { decodePolicy } from "./updater"

describe("updater", () => {
  test("reads update policy from JSONC", () => {
    expect(decodePolicy('{ // preference\n "update": "notify",\n}')).toBe("notify")
    expect(decodePolicy('{ "update": "disable" }')).toBe("disable")
    expect(decodePolicy('{ "update": "auto" }')).toBe("auto")
    expect(decodePolicy('{ "update": "invalid" }')).toBeUndefined()
  })

  test("maps the v1 update policy", () => {
    expect(decodePolicy('{ "autoupdate": false }')).toBe("disable")
    expect(decodePolicy('{ "autoupdate": "notify" }')).toBe("notify")
    expect(decodePolicy('{ "autoupdate": true }')).toBe("auto")
  })
})
