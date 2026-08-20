# Mailwatch

A focused inbox for the messages that can change your next step — **University of New Brunswick (Fredericton)** and **IRCC**.

Mailwatch connects to Gmail and/or Outlook with read-only access, then surfaces only mail from those two worlds.

## What it watches

**UNB Fredericton** — every address on the school’s domains, not a single office:

- `unb.ca` (registrar, admissions, ISAO, student accounts, faculty, and anyone else)
- `unbsu.ca` (Student Union)

**IRCC** — official Immigration, Refugees and Citizenship Canada senders:

- `cic.gc.ca`
- `ircc.gc.ca`
- `ircc.canada.ca`
- `apps.cic.gc.ca`
- plus From-name matches for “IRCC” / “Immigration, Refugees and Citizenship”

You can add extra addresses or domains from the app.

Priority flags biometrics letters, document requests, tuition deadlines, and similar action mail.

## Run locally

```bash
npm install
npm start
```

Then open `http://localhost:4173`.

You can also serve the files with any static server. The small Express app is only there to host the UI and optional public client IDs from the environment.

## Connect a real mailbox

Mailwatch uses **public OAuth client IDs** in the browser. There is no client secret and the app never sends mail.

1. Open Mailwatch and choose **Continue with Google** or **Continue with Microsoft**.
2. If you have not created a client ID yet, use **First time? Set up mailbox access**.
3. Paste the client ID and sign in.

### Google (Gmail)

1. Create a project in [Google Cloud credentials](https://console.cloud.google.com/apis/credentials).
2. Enable the **Gmail API**.
3. Configure the OAuth consent screen (External is fine). Add your own Google account as a test user.
4. Create an OAuth client ID of type **Web application**.
5. Under **Authorized JavaScript origins**, add the origin shown in the app (for local use: `http://localhost:4173`).
6. Paste the client ID into Mailwatch.

Scope requested: `gmail.readonly` plus basic profile email.

### Microsoft (Outlook / Hotmail / Microsoft 365)

1. Create an app in [Azure app registrations](https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade).
2. Supported account types: any org directory **and** personal Microsoft accounts.
3. Platform: **Single-page application**. Redirect URI = the origin shown in the app.
4. Delegated permissions: `Mail.Read`, `User.Read`.
5. Paste the Application (client) ID into Mailwatch.

You can connect both providers. Messages are merged into one watchlist.

Optional environment variables (public IDs only):

```
GOOGLE_CLIENT_ID=
MICROSOFT_CLIENT_ID=
PORT=4173
```

See `.env.example`.

## Demo mode

**Explore with sample UNB & IRCC mail** walks through the dashboard without linking an inbox.

## Privacy

- Only messages matching the watchlist are shown.
- Access is read-only.
- Client IDs and UI preferences stay in your browser (`localStorage`). Access tokens are requested as needed and are not written to the repo.
- Disconnect at any time from Settings.
