# Troubleshooting

## "NetworkError when attempting to fetch resource" when testing the connection

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

## "The url has already been taken" when saving a link

This is LinkAce itself, not the extension — LinkAce rejects duplicate
URLs by default. If you're trying to re-save a page you've already
bookmarked, this is expected.

## "permissions.request may only be called from a user input handler"

Firefox requires `browser.permissions.request()` to be the first
`await`-ing call made in direct response to a click/submit event — even a
quick `permissions.contains()` check beforehand breaks the chain. Not
something you can work around from Settings; this only matters if you're
modifying the extension's code.
