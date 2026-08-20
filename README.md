# Mailwatch

A focused mail dashboard for messages that matter most — currently set up to watch a school sender and IRCC.

## What is included

- Responsive Mailwatch dashboard with a connected-mailbox state
- Watchlist filters for all mail, school mail, and IRCC mail
- Priority inbox, unread counts, attention items, starred messages, search, and message detail view
- Add-sender flow for email addresses or domains
- Settings and privacy screens, plus a short onboarding view
- Mock messages so the interface can be explored without exposing a real inbox

## Run locally

This is a dependency-free frontend. Serve the repository with any static file server, for example:

```bash
python3 -m http.server 4173 --bind 0.0.0.0
```

Then open `http://localhost:4173`.

## Connecting a real mailbox

The current Gmail connection flow is a safe UI prototype and uses sample mail. A production connection should be implemented through a server-side OAuth flow with Gmail read-only scope (never put a client secret in the browser). After OAuth, the server can query Gmail for the configured sender addresses/domains, persist only the needed metadata, and expose the filtered results to this interface. The `connectGmail` and `syncMailbox` handlers in `app.js` are the intended integration points.
