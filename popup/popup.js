const ICONS = {
  warning:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
  lock:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
};

function parseList(value) {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

async function main() {
  const { messages } = await applyI18n(document);

  const notice = document.getElementById("notice");
  const noticeIcon = document.getElementById("notice-icon");
  const noticeText = document.getElementById("notice-text");
  const noticeBtn = document.getElementById("notice-btn");
  const form = document.getElementById("save-form");
  const urlInput = document.getElementById("url");
  const titleInput = document.getElementById("title");
  const descriptionInput = document.getElementById("description");
  const tagsInput = document.getElementById("tags");
  const listsInput = document.getElementById("lists");
  const tagsList = document.getElementById("tags-list");
  const listsList = document.getElementById("lists-list");
  const saveBtn = document.getElementById("save-btn");
  const status = document.getElementById("status");

  // Opening a native permission prompt from this small popup panel can
  // make Firefox drop focus from the popup and close it before the
  // request resolves. Settings is a full tab, so permission requests are
  // handled there (on Test/Save) instead of here.
  noticeBtn.addEventListener("click", () => {
    browser.runtime.openOptionsPage();
    window.close();
  });

  const config = await getConfig();
  if (!config.instanceUrl || !config.apiToken) {
    noticeText.textContent = t(messages, "popupNotConfigured");
    noticeIcon.innerHTML = ICONS.warning;
    notice.className = "notice-warning";
    notice.hidden = false;
    return;
  }

  const pattern = originPattern(config.instanceUrl);
  const hasAccess = await browser.permissions.contains({ origins: [pattern] });
  if (!hasAccess) {
    noticeText.textContent = t(messages, "popupGrantAccess");
    noticeIcon.innerHTML = ICONS.lock;
    notice.className = "notice-info";
    notice.hidden = false;
    return;
  }

  form.hidden = false;

  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  urlInput.value = tab.url || "";
  titleInput.value = tab.title || "";

  status.textContent = t(messages, "popupLoadingLists");
  status.className = "";
  try {
    const [tags, lists] = await Promise.all([
      fetchAllTags(config.instanceUrl, config.apiToken),
      fetchAllLists(config.instanceUrl, config.apiToken),
    ]);
    tagsList.innerHTML = tags.map((tag) => `<option value="${tag}"></option>`).join("");
    listsList.innerHTML = lists.map((list) => `<option value="${list}"></option>`).join("");
    status.textContent = "";
  } catch (err) {
    status.textContent = t(messages, "popupError", { ERROR: err.message });
    status.className = "status-error";
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    saveBtn.disabled = true;
    status.textContent = t(messages, "popupSaving");
    status.className = "";
    try {
      await createLink(config.instanceUrl, config.apiToken, {
        url: urlInput.value,
        title: titleInput.value,
        description: descriptionInput.value,
        tags: parseList(tagsInput.value),
        lists: parseList(listsInput.value),
      });
      status.textContent = t(messages, "popupSaved");
      status.className = "status-success";
      setTimeout(() => window.close(), 900);
    } catch (err) {
      saveBtn.disabled = false;
      status.textContent = t(messages, "popupError", { ERROR: err.message });
      status.className = "status-error";
    }
  });
}

main();
