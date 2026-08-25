(() => {
  "use strict";

  const storageKey = "opstriage-theme";
  let storedTheme = null;

  try {
    storedTheme = window.localStorage.getItem(storageKey);
  } catch {
    // Storage can be unavailable in strict privacy modes; system preference still works.
  }

  const systemTheme = window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
  const theme = storedTheme === "dark" || storedTheme === "light" ? storedTheme : systemTheme;

  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", theme === "dark" ? "#07101c" : "#f5f7f8");
})();
