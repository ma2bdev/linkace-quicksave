async function main() {
  let { messages } = await applyI18n(document);

  const form = document.getElementById("config-form");
  const instanceUrlInput = document.getElementById("instance-url");
  const apiTokenInput = document.getElementById("api-token");
  const languageSelect = document.getElementById("language-select");
  const toggleTokenBtn = document.getElementById("toggle-token");
  const testBtn = document.getElementById("test-btn");
  const status = document.getElementById("status");

  const config = await getConfig();
  instanceUrlInput.value = config.instanceUrl;
  apiTokenInput.value = config.apiToken;

  const { language } = await browser.storage.local.get("language");
  languageSelect.value = language && ["en", "es"].includes(language) ? language : "auto";

  languageSelect.addEventListener("change", async () => {
    await setPreferredLocale(languageSelect.value === "auto" ? "" : languageSelect.value);
    ({ messages } = await applyI18n(document));
  });

  toggleTokenBtn.addEventListener("click", () => {
    const isPassword = apiTokenInput.type === "password";
    apiTokenInput.type = isPassword ? "text" : "password";
    toggleTokenBtn.textContent = t(messages, isPassword ? "toggleTokenHide" : "toggleTokenShow");
  });

  testBtn.addEventListener("click", async () => {
    status.textContent = t(messages, "statusTesting");
    try {
      const instanceUrl = normalizeInstanceUrl(instanceUrlInput.value);
      const granted = await ensureHostPermission(instanceUrl);
      if (!granted) {
        status.textContent = t(messages, "statusTestError", { ERROR: "permission denied" });
        return;
      }
      await testConnection(instanceUrl, apiTokenInput.value.trim());
      status.textContent = t(messages, "statusTestSuccess");
    } catch (err) {
      status.textContent = t(messages, "statusTestError", { ERROR: err.message });
    }
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const instanceUrl = normalizeInstanceUrl(instanceUrlInput.value);
    await ensureHostPermission(instanceUrl);
    await setConfig({
      instanceUrl: instanceUrlInput.value,
      apiToken: apiTokenInput.value,
    });
    status.textContent = t(messages, "statusSaved");
  });
}

main();
