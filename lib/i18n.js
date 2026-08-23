// Custom i18n loader.
//
// browser.i18n.getMessage() only ever returns strings in the browser's own
// UI language — there is no supported way to force it to a different
// locale at runtime. Since we want a language picker in Settings that is
// independent of the browser's UI language, we load the same
// _locales/<lang>/messages.json files ourselves and apply them manually.

const SUPPORTED_LOCALES = ["en", "es"];
const DEFAULT_LOCALE = "en";

async function getPreferredLocale() {
  const { language } = await browser.storage.local.get("language");
  if (language && SUPPORTED_LOCALES.includes(language)) {
    return language;
  }
  const uiLang = browser.i18n.getUILanguage().split("-")[0];
  return SUPPORTED_LOCALES.includes(uiLang) ? uiLang : DEFAULT_LOCALE;
}

async function setPreferredLocale(language) {
  await browser.storage.local.set({ language });
}

async function loadMessages(locale) {
  const url = browser.runtime.getURL(`_locales/${locale}/messages.json`);
  const res = await fetch(url);
  return res.json();
}

function t(messages, key, substitutions = {}) {
  const entry = messages[key];
  if (!entry) return key;
  let msg = entry.message;
  for (const [name, value] of Object.entries(substitutions)) {
    msg = msg.replace(new RegExp(`\\$${name}\\$`, "gi"), value);
  }
  return msg;
}

// Applies data-i18n / data-i18n-placeholder attributes found under `root`
// and returns the active locale + messages so callers can build further
// strings (e.g. status messages with substitutions) via t().
async function applyI18n(root = document) {
  const locale = await getPreferredLocale();
  const messages = await loadMessages(locale);

  root.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = t(messages, el.getAttribute("data-i18n"));
  });

  root.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    el.setAttribute("placeholder", t(messages, el.getAttribute("data-i18n-placeholder")));
  });

  const titleKey = document.querySelector("title")?.getAttribute("data-i18n");
  if (titleKey) {
    document.title = t(messages, titleKey);
  }

  return { locale, messages };
}
