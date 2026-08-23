// Shared helpers for talking to a LinkAce instance and reading extension config.

const STORAGE_KEYS = {
  instanceUrl: "instanceUrl",
  apiToken: "apiToken",
};

function normalizeInstanceUrl(url) {
  return url.trim().replace(/\/+$/, "");
}

async function getConfig() {
  const stored = await browser.storage.local.get([
    STORAGE_KEYS.instanceUrl,
    STORAGE_KEYS.apiToken,
  ]);
  return {
    instanceUrl: stored[STORAGE_KEYS.instanceUrl] || "",
    apiToken: stored[STORAGE_KEYS.apiToken] || "",
  };
}

async function setConfig({ instanceUrl, apiToken }) {
  await browser.storage.local.set({
    [STORAGE_KEYS.instanceUrl]: normalizeInstanceUrl(instanceUrl),
    [STORAGE_KEYS.apiToken]: apiToken.trim(),
  });
}

function originPattern(instanceUrl) {
  const url = new URL(instanceUrl);
  return `${url.protocol}//${url.host}/*`;
}

// fetch() to the configured instance requires its origin to be granted
// from optional_host_permissions ("*://*/*" in the manifest). Firefox
// surfaces a missing grant as a generic "NetworkError when attempting to
// fetch resource" rather than a permissions error, so callers must request
// it explicitly before making API calls.
//
// Firefox requires permissions.request() to be called synchronously from
// within a user input handler (e.g. a click listener) — any `await` before
// it (even a quick permissions.contains() check) breaks that chain and the
// call is rejected with "permissions.request may only be called from a
// user input handler". So this must be the first await-ing call made in
// response to the gesture; it resolves immediately (no prompt) if the
// permission is already granted.
function ensureHostPermission(instanceUrl) {
  const pattern = originPattern(instanceUrl);
  return browser.permissions.request({ origins: [pattern] });
}

function apiHeaders(apiToken) {
  return {
    Authorization: `Bearer ${apiToken}`,
    Accept: "application/json",
    "Content-Type": "application/json",
  };
}

class LinkAceApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "LinkAceApiError";
    this.status = status;
  }
}

async function apiRequest(instanceUrl, apiToken, path, options = {}) {
  const res = await fetch(`${instanceUrl}${path}`, {
    ...options,
    headers: { ...apiHeaders(apiToken), ...(options.headers || {}) },
  });

  let body = null;
  try {
    body = await res.json();
  } catch (_) {
    // no JSON body
  }

  if (!res.ok) {
    const message =
      (body && (body.message || Object.values(body.errors || {}).flat().join(" "))) ||
      `Error ${res.status}`;
    throw new LinkAceApiError(message, res.status);
  }

  return body;
}

async function fetchAllTags(instanceUrl, apiToken) {
  const data = await apiRequest(instanceUrl, apiToken, "/api/v2/tags?per_page=200");
  return (data.data || []).map((t) => t.name).sort((a, b) => a.localeCompare(b));
}

async function fetchAllLists(instanceUrl, apiToken) {
  const data = await apiRequest(instanceUrl, apiToken, "/api/v2/lists?per_page=200");
  return (data.data || []).map((l) => l.name).sort((a, b) => a.localeCompare(b));
}

// Best-effort duplicate check so the popup can warn before saving instead
// of only surfacing LinkAce's "url has already been taken" error after a
// failed POST. /api/v2/search/links does a substring match, so the result
// still needs an exact comparison against the normalized URL.
async function findLinkByUrl(instanceUrl, apiToken, url) {
  const target = normalizeInstanceUrl(url);
  const params = new URLSearchParams({ query: url, per_page: "20" });
  const data = await apiRequest(instanceUrl, apiToken, `/api/v2/search/links?${params.toString()}`);
  const links = data.data || [];
  return links.find((link) => normalizeInstanceUrl(link.url) === target) || null;
}

async function createLink(instanceUrl, apiToken, { url, title, description, tags, lists, visibility }) {
  return apiRequest(instanceUrl, apiToken, "/api/v2/links", {
    method: "POST",
    body: JSON.stringify({ url, title, description, tags, lists, visibility }),
  });
}

// Full link details, including its tags/lists — /api/v2/search/links only
// returns the bare LinkWithoutRelations shape, so this is needed to
// pre-fill an edit form with what's already saved.
async function getLink(instanceUrl, apiToken, linkId) {
  return apiRequest(instanceUrl, apiToken, `/api/v2/links/${linkId}`);
}

async function updateLink(instanceUrl, apiToken, linkId, { url, title, description, tags, lists, visibility }) {
  return apiRequest(instanceUrl, apiToken, `/api/v2/links/${linkId}`, {
    method: "PATCH",
    body: JSON.stringify({ url, title, description, tags, lists, visibility }),
  });
}

async function testConnection(instanceUrl, apiToken) {
  // A cheap authenticated call used purely to validate URL + token.
  await apiRequest(instanceUrl, apiToken, "/api/v2/tags?per_page=1");
}
