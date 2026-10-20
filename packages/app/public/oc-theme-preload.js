;(function () {
  var key = "opencode-theme-id"
  var themeId = localStorage.getItem(key) || "hips"

  var scheme = localStorage.getItem("opencode-color-scheme") || "system"
  var isDark = scheme === "dark" || (scheme === "system" && matchMedia("(prefers-color-scheme: dark)").matches)
  var mode = isDark ? "dark" : "light"

  // A first visit has no cached css yet: seed the default theme's backgrounds so the first frame
  // is already HIPS instead of the static oc-2 colors.
  var css =
    localStorage.getItem("opencode-theme-css-" + mode) ||
    (themeId === "hips"
      ? isDark
        ? "--background-base: #011e43;\n  --v2-background-bg-deep: #00142f;"
        : "--background-base: #f5f8fb;\n  --v2-background-bg-deep: #edf3f5;"
      : "")
  var deep = css.match(/--v2-background-bg-deep:\s*([^;]+);/)
  var background = deep ? deep[1].trim() : isDark ? "#080808" : "#fafafa"

  document.documentElement.dataset.theme = themeId
  document.documentElement.dataset.colorScheme = mode
  document.documentElement.style.backgroundColor = background

  // Update theme-color meta tag to match the theme's background
  var metas = document.querySelectorAll("meta[name='theme-color']")
  if (metas.length > 0) metas[0].setAttribute("content", background)

  if (themeId === "oc-2") return

  if (css) {
    var style = document.createElement("style")
    style.id = "oc-theme-preload"
    style.textContent =
      ":root{color-scheme:" +
      mode +
      ";--text-mix-blend-mode:" +
      (isDark ? "plus-lighter" : "multiply") +
      ";" +
      css +
      "}"
    document.head.appendChild(style)
  }
})()
