// The URL is used only to choose language, never reflected into markup.
const language = location.pathname.split("/")[1] === "en" ? "en" : "es";
document.documentElement.lang = language;
document.querySelectorAll("[data-language]").forEach((section) => {
  section.hidden = section.dataset.language !== language;
});
document.querySelectorAll("[data-reload]").forEach((button) => {
  button.addEventListener("click", () => location.reload());
});
