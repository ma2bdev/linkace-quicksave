const ICONS = {
  warning:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
  lock:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
  save:
    '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z"/><path d="M17 21v-8H7v8"/><path d="M7 3v5h8"/>',
  update:
    '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/>',
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
  const saveBtnIcon = document.getElementById("save-btn-icon");
  const saveBtnLabel = document.getElementById("save-btn-label");
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

  // Best-effort: pull the page's own meta description in as a starting
  // point. Fails silently on pages the extension can't script (about:,
  // addons.mozilla.org, etc.) since the field is optional anyway.
  try {
    const [{ result: pageDescription }] = await browser.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const meta =
          document.querySelector('meta[name="description"]') ||
          document.querySelector('meta[property="og:description"]');
        return meta ? meta.content.trim() : "";
      },
    });
    descriptionInput.value = pageDescription || "";
  } catch {
    // ignore — restricted page, or no content script access
  }

  setupAutocomplete(tagsInput, tagsSuggestions, () => fetchAllTags(config.instanceUrl, config.apiToken), messages);
  setupAutocomplete(listsInput, listsSuggestions, () => fetchAllLists(config.instanceUrl, config.apiToken), messages);

  let existingLinkId = null;
  function setUpdateMode(id) {
    existingLinkId = id;
    saveBtnLabel.textContent = t(messages, id ? "popupUpdateBtn" : "popupSaveBtn");
    saveBtnIcon.innerHTML = id ? ICONS.update : ICONS.save;
  }

  let duplicateCheckToken = 0;
  async function checkDuplicate({ prefill = false } = {}) {
    const url = urlInput.value.trim();
    const token = ++duplicateCheckToken;
    if (!url) {
      duplicateWarning.hidden = true;
      setUpdateMode(null);
      return;
    }
    let existing;
    try {
      existing = await findLinkByUrl(config.instanceUrl, config.apiToken, url);
    } catch {
      return; // silent — this is a best-effort check, not the source of truth
    }
    if (token !== duplicateCheckToken) return; // a newer check superseded this one
    if (!existing) {
      duplicateWarning.hidden = true;
      setUpdateMode(null);
      return;
    }

    const viewUrl = `${config.instanceUrl}/links/${existing.id}`;
    duplicateWarning.innerHTML = `${escapeHtml(t(messages, "popupDuplicateWarning"))} <a href="${escapeHtml(viewUrl)}" target="_blank" rel="noopener">${escapeHtml(t(messages, "popupViewLink"))}</a>`;
    duplicateWarning.hidden = false;
    setUpdateMode(existing.id);

    if (!prefill) return;
    // /api/v2/search/links omits tags/lists, so fetch the full record to
    // load the form with what's already saved instead of overwriting it
    // with blanks.
    try {
      const full = await getLink(config.instanceUrl, config.apiToken, existing.id);
      if (token !== duplicateCheckToken) return;
      if (full.title) titleInput.value = full.title;
      descriptionInput.value = full.description || "";
      tagsInput.value = (full.tags || []).map((tag) => tag.name).join(", ");
      if (tagsInput.value) tagsInput.value += ", ";
      listsInput.value = (full.lists || []).map((list) => list.name).join(", ");
      if (listsInput.value) listsInput.value += ", ";
      visibilitySelect.value = String(full.visibility || existing.visibility || 1);
    } catch {
      // ignore — keep whatever was already prefilled from the tab
    }
  }

  let duplicateCheckTimer;
  urlInput.addEventListener("input", () => {
    clearTimeout(duplicateCheckTimer);
    duplicateCheckTimer = setTimeout(() => checkDuplicate(), 400);
  });
  checkDuplicate({ prefill: true });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    saveBtn.disabled = true;
    const isUpdate = existingLinkId !== null;
    status.textContent = t(messages, isUpdate ? "popupUpdating" : "popupSaving");
    status.className = "";
    const payload = {
      url: urlInput.value,
      title: titleInput.value,
      description: descriptionInput.value,
      tags: parseList(tagsInput.value),
      lists: parseList(listsInput.value),
      visibility: Number(visibilitySelect.value),
    };
    try {
      if (isUpdate) {
        await updateLink(config.instanceUrl, config.apiToken, existingLinkId, payload);
        status.textContent = t(messages, "popupUpdated");
      } else {
        await createLink(config.instanceUrl, config.apiToken, payload);
        status.textContent = t(messages, "popupSaved");
      }
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
