# LinkAce Quick Save

A Firefox extension to save the current tab to your self-hosted
[LinkAce](https://www.linkace.org/) instance in one click — pick tags and
lists without leaving the page, no bookmarks toolbar needed.

## Status

Core save flow works end to end: popup, options, and REST API client are
all in place. Not yet published — see [Roadmap](#roadmap).

## Features

- Save the current tab to LinkAce via its REST API (`/api/v2/links`)
- Assign existing tags and lists at save time
- Keyboard shortcut (`Alt+Shift+L` by default)
- Settings page for instance URL, API token, and language
- Interface available in English and Spanish

## Requirements

**Your LinkAce instance must be served over HTTPS.** This isn't optional
or extension-specific — modern Firefox actively blocks or silently
rewrites plain `http://` requests from extensions to arbitrary hosts (see
[Troubleshooting](#troubleshooting)). A self-signed certificate is fine;
plain HTTP is not supported.

## Why an API token, not the bookmarklet flow?

LinkAce ships an official bookmarklet that opens
`{instance}/links/create?url=...` using your existing browser session —
no token required. This extension instead uses LinkAce's versioned REST
API with a personal API token, because it lets the popup pre-fill tags
and lists before saving, which the bookmarklet's URL-only flow can't do.
The token is stored locally (`browser.storage.local`) and is only ever
sent to the instance URL you configure.

## Installation (development)

1. Clone this repo.
2. In Firefox, open `about:debugging#/runtime/this-firefox`.
3. Click **Load Temporary Add-on** and select `manifest.json`.
4. Open the extension's options page and set your LinkAce instance URL
   and API token (Profile → API Tokens in LinkAce).

## Troubleshooting

### "NetworkError when attempting to fetch resource" when testing the connection

**Short version: your instance must be on `https://`, not `http://`.** The
steps below explain why plain HTTP doesn't work and how to get a
certificate (even a self-signed one) in front of a local/self-hosted
instance.

This almost always means the extension doesn't have permission to talk to
your instance's origin yet, or the browser is silently rewriting the
request's scheme before it ever reaches your server. Work through these in
order:

1. **Grant the host permission.** The extension requests access to your
   instance's origin the first time you click **Test connection** or
   **Save** in Settings — accept the native Firefox prompt when it
   appears. If you don't see a prompt and still get this error, the
   remaining causes are almost always specific to self-hosted / local
   network instances (homelab setups), where Firefox applies extra
   upgrade-to-HTTPS behavior:

2. **Firefox's HTTPS-First mode.** Separate from the "HTTPS-Only Mode"
   toggle in Settings → Privacy & Security, `dom.security.https_first` in
   `about:config` is enabled by default and silently retries `http://`
   requests as `https://` — but only for full page loads, not for a
   `fetch()` from the extension, which just fails outright. This can
   affect local hostnames too, since Firefox only recognizes literal IPs
   or `.local` names as "local", not arbitrary homelab TLDs (e.g.
   `.home`).

3. **DNS HTTPS/SVCB records.** If your DNS resolver (e.g. AdGuard Home)
   or reverse proxy publishes an HTTPS-type DNS record for your instance,
   Firefox will upgrade to HTTPS before even attempting the connection,
   regardless of the prefs above. Check `about:config` for
   `network.dns.upgrade_with_https_rr` — if it's `true` and your instance
   doesn't actually serve valid HTTPS, this is the culprit.

4. **The real fix for local/self-hosted instances: serve real HTTPS.**
   Rather than disabling browser security features, put your instance
   behind a reverse proxy (e.g. Nginx Proxy Manager, Caddy, Traefik) with
   a certificate — even a self-signed one works for this purpose:
   - Generate one: `openssl req -x509 -newkey rsa:2048 -keyout
     instance.key -out instance.crt -days 365 -nodes -subj
     "/CN=your.instance.host" -addext
     "subjectAltName=DNS:your.instance.host"`
   - Upload it as a Custom certificate on the proxy host in front of your
     instance.
   - Visit `https://your.instance.host/` once in a normal tab and accept
     the self-signed certificate warning (Advanced → Accept the Risk and
     Continue). This exception is stored per-host in Firefox and also
     covers the extension's `fetch()` calls.
   - Point the extension at the `https://` URL.

## Roadmap

- [ ] Background/service worker if needed for optional host permissions
- [ ] Publish to addons.mozilla.org (add signing/submission steps to
      Installation once this happens)

## Contributing

Issues and PRs welcome. This project is not affiliated with the LinkAce
project or its author; it's a third-party client built against LinkAce's
public API.

## License

[GPL-3.0](LICENSE).
