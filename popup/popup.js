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

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// Fetches suggestions lazily (on first focus, not on popup load) and
// renders them in a custom dropdown that inherits the form's own styles,
// since a native <datalist> can't be restyled to match.
function setupAutocomplete(input, list, loader, messages) {
  let items = null;

  function currentQuery() {
    const raw = input.value;
    return raw.slice(raw.lastIndexOf(",") + 1).trim().toLowerCase();
  }

  function render() {
    if (items === null) return;
    const query = currentQuery();
    const filtered = query ? items.filter((item) => item.toLowerCase().includes(query)) : items;
    list.innerHTML = filtered.length
      ? filtered
          .slice(0, 20)
          .map((item) => `<li data-value="${escapeHtml(item)}">${escapeHtml(item)}</li>`)
          .join("")
      : `<li class="suggestions-empty">${escapeHtml(t(messages, "popupNoSuggestions"))}</li>`;
    list.hidden = false;
  }

  async function ensureLoaded() {
    if (items !== null) {
      render();
      return;
    }
    list.innerHTML = `<li class="suggestions-empty">${escapeHtml(t(messages, "popupLoadingSuggestions"))}</li>`;
    list.hidden = false;
    try {
      items = await loader();
    } catch (err) {
      items = [];
      list.innerHTML = `<li class="suggestions-empty">${escapeHtml(t(messages, "popupError", { ERROR: err.message }))}</li>`;
      return;
    }
    render();
  }

  input.addEventListener("focus", ensureLoaded);
  input.addEventListener("input", render);
  input.addEventListener("blur", () => {
    setTimeout(() => {
      list.hidden = true;
    }, 150);
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "Escape") list.hidden = true;
  });

  list.addEventListener("mousedown", (event) => {
    const li = event.target.closest("li[data-value]");
    if (!li) return;
    event.preventDefault();
    const raw = input.value;
    const lastComma = raw.lastIndexOf(",");
    const before = lastComma >= 0 ? `${raw.slice(0, lastComma + 1)} ` : "";
    input.value = `${before}${li.dataset.value}, `;
    list.hidden = true;
    input.focus();
  });
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
  const tagsSuggestions = document.getElementById("tags-suggestions");
  const listsSuggestions = document.getElementById("lists-suggestions");
  const visibilitySelect = document.getElementById("visibility");
  const duplicateWarning = document.getElementById("duplicate-warning");
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

  setupAutocomplete(tagsInput, tagsSuggestions, () => fetchAllTags(config.instanceUrl, config.apiToken), messages);
  setupAutocomplete(listsInput, listsSuggestions, () => fetchAllLists(config.instanceUrl, config.apiToken), messages);

  let duplicateCheckToken = 0;
  async function checkDuplicate() {
    const url = urlInput.value.trim();
    const token = ++duplicateCheckToken;
    if (!url) {
      duplicateWarning.hidden = true;
      return;
    }
    let existing;
    try {
      existing = await findLinkByUrl(config.instanceUrl, config.apiToken, url);
    } catch {
      return; // silent — this is a best-effort check, not the source of truth
    }
    if (token !== duplicateCheckToken) return; // a newer check superseded this one
    if (existing) {
      const viewUrl = `${config.instanceUrl}/links/${existing.id}`;
      duplicateWarning.innerHTML = `${escapeHtml(t(messages, "popupDuplicateWarning"))} <a href="${escapeHtml(viewUrl)}" target="_blank" rel="noopener">${escapeHtml(t(messages, "popupViewLink"))}</a>`;
      duplicateWarning.hidden = false;
    } else {
      duplicateWarning.hidden = true;
    }
  }

  let duplicateCheckTimer;
  urlInput.addEventListener("input", () => {
    clearTimeout(duplicateCheckTimer);
    duplicateCheckTimer = setTimeout(checkDuplicate, 400);
  });
  checkDuplicate();

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
        visibility: Number(visibilitySelect.value),
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
