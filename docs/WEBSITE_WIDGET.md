# Website chat widget

Replyvoo customers can put their AI Closer on their own website as a chat bubble. It is the same Closer engine as Telegram: same knowledge base, HeatScore, handoff, per-conversation billing, Pulse Inbox, Live Room and Leads.

- Customer page: **Dashboard → Widget Studio** (`/app/widget`), also reachable from **Channels → Website chat**.
- Script: `public/widget.js` (vanilla JS, no dependencies), served at `https://APP_URL/widget.js`.
- Public API: `/w/:key/*` (see `docs/API.md` → Website widget).
- Marketing page: `/website-ai-chatbot`. Replyvoo's own site chat bubble is the same script in "house" mode.

## 1. Install (for customers)

1. Open **Widget Studio**, choose the Closer that answers and add your domain under **Domains & install**.
2. Copy the install code:

   ```html
   <script src="https://app.replyvoo.com/widget.js" data-key="wk_XXXXXXXXXXXXXXXXXXXX" async></script>
   ```

3. Paste it on every page where the chat should appear, just before `</body>`:

| Platform | Where to paste |
|---|---|
| Plain HTML | Before `</body>` in every page or in the shared footer template. |
| WordPress | A header/footer code plugin (e.g. WPCode) → site-wide footer, or your theme's custom code box. |
| Shopify | Online Store → Themes → … → Edit code → `layout/theme.liquid`, above `</body>`. |
| Wix | Settings → Custom code (paid plan + connected domain) → Add Custom Code → All pages → Body - end. |
| Webflow | Site settings → Custom code → Footer code → Save → Publish. |
| Google Tag Manager | New tag → Custom HTML → paste → trigger All Pages → Submit/Publish. |

4. Open your site, then press **Check installation** in Widget Studio. The server records the host and time the widget config was last fetched from an allowed origin ("Installed on shop.example.com, seen 2 min ago").

JavaScript API on the host page (after the script loads):

```js
Replyvoo.open();     // open the panel
Replyvoo.close();
Replyvoo.toggle();
Replyvoo.identify({ name: 'Emma', email: 'emma@example.com', phone: '+34…' }); // saves the lead silently
```

Calls made before the script has loaded can be queued: `window.Replyvoo = { q: [['open']] }`.

## 2. Settings (Widget Studio)

Everything is previewed live (mock browser, desktop/phone toggle) before you press **Save widget**. The preview uses the real `widget.js` in preview mode and never calls the network; its replies are samples.

**Look**
- 6 presets: Replyvoo Gold, Midnight, Clean White, Soft Pastel, Bold Ink, Glass. Editing any colour switches to "Custom".
- Colours: main colour, text on main colour, header, header text, panel background, text, Closer bubble (+ text), visitor bubble (+ text). `#RRGGBB` only.
- Font: system or Plus Jakarta Sans, Inter, DM Sans, Poppins, Nunito (loaded from Google Fonts by the widget).
- Corner roundness (0–32 px), glass panel, dark mode (auto / light / dark).
- Launcher: bubble icon, pill with text, or avatar. Position bottom-right/left, side and bottom offsets, size compact / normal / large.
- Header title, subtitle, green online dot, logo upload, Closer avatar (initials or uploaded photo), Closer display name, launcher icon upload.

**Texts**: welcome message, input placeholder, up to 4 quick replies, proactive greeting (text, after N seconds, 0 = off, optional "only on pages containing"), handoff text, outside-hours text, "AI assistant" disclosure label (on by default; the EU AI Act asks businesses to tell people they're talking to an AI).

**Human feel**: shortest/longest reply delay (default 1.5–4 s), "type like a human" (delay grows with answer length at the chosen characters/second, capped by the maximum), sound on new message (off by default; a tiny WebAudio beep, no files). Languages are automatic.

**Lead capture**: off / after the first reply / before the chat, with name, email and phone each optional or required. Leads are saved on the contact (`email`, `phone`), get an event "New website lead", are warmed to HeatScore *warm* and show in Leads and in the Pulse Inbox lead panel.

**Advanced**: widget name, which Closer answers (or none: your team answers from Pulse Inbox), business hours with time zone (outside hours the AI still answers; the outside-hours text replaces the handoff text), "Continue on Telegram" button (links to your connected bot), hide "Powered by Replyvoo" (Business+), custom CSS (Business+, max 5,000 chars), remove widget.

The "Powered by Replyvoo" link carries the owner's Voo Squad referral code (`/?ref=CODE`).

## 3. How a message flows

1. The visitor's browser generates a visitor id (`v_` + 24 random characters) stored in `localStorage` with the last 60 messages.
2. `POST /w/:key/messages` → origin check → rate limits → `engine.handleInbound()` with the website channel. The engine stores the message (with `page_url`/`page_title` in its meta), scores HeatScore, bills the conversation exactly like Telegram, asks the AI and stores the reply. Website channels have no token, so nothing is sent anywhere: the reply comes back in the HTTP response.
3. The server returns `delay_ms` / `typing_ms`. The widget shows the typing indicator and reveals the reply when `delay_ms` has passed since the visitor hit send (the AI's own response time counts towards it; the server never sleeps).
4. Handoff (`[HANDOFF]` from the AI) or a human takeover in Pulse Inbox: the AI goes quiet, the widget shows the handoff / outside-hours text and polls `GET /w/:key/messages` every 4 s while open (every ~24 s when closed and a conversation exists) to show human replies, with an unread badge.

## 4. Plan gating

- `plans.website_sites` (0 = locked), `plans.remove_branding`, `plans.custom_css` (migration `004_website_chat.sql`). Defaults: Spark/Starter/Growth 0, Pro 1, Business 3 (+branding, +CSS), Titan 10 (+both), Black 999 (+both).
- Power-up `website-chat` ($29): each purchase adds one 30-day website slot (`workspaces.settings.web_slots`).
- `workspace.limits()` → `website_sites = plan.website_sites + active slots`. Creating a widget beyond the limit returns **402 `website_limit`**; the dashboard shows "Locked — available on Pro and up, or add the Website chat power-up" with upgrade/buy buttons.
- If a workspace later has fewer slots than widgets (downgrade, expired power-up), the oldest widgets stay on and the rest go offline ("This chat is paused") until a slot frees up.
- Admin flag `flags.channels.website` (`live` / `soon` / `off`). Not live → config reports `online: false`, messages and leads return 503 `{offline:true}`, creating widgets returns 403.

## 5. Security model

- **Origin lock**: every `/w/:key/*` call (except images) must come from an allowed domain, read from `Origin` (or `Referer` when Origin is missing). `example.com` also allows `www.example.com`; `*.example.com` allows every subdomain and `example.com`. `localhost`/`127.0.0.1` are allowed outside production, or in production when the owner adds them. Anything else is 403 `origin_not_allowed`.
- **CORS** is answered by the widget routes with the exact allowed origin (never `*`), `Vary: Origin`, and an `OPTIONS` preflight handler. These routes live outside `/api/` so the `x-rv` CSRF header is not required; no cookies are used (`credentials: 'omit'`).
- **Rate limits** (in memory): 30 messages / 10 min per visitor, 200 messages / hour per IP, 10 lead submissions / hour per visitor, config 300 / 10 min per IP, polling 2,400 / hour per IP. Messages are text only, max 1,000 characters.
- **Isolation**: a visitor only ever sees messages of the thread whose `chat_id` is their visitor id on that channel; visitor ids are random and validated (`/^v_[A-Za-z0-9]{16,40}$/`).
- **Rendering**: the widget lives in a Shadow DOM (host page CSS can't reach it), never uses `innerHTML` with message text, and only turns `http(s)` URLs into links (`rel="noopener noreferrer nofollow"`).
- **Uploads**: PNG, JPEG or WebP only, checked by magic bytes, max 300 KB, stored in `widget_assets` and served from `/w/:key/asset/:kind` with the stored content type, `X-Content-Type-Options: nosniff` and `Content-Security-Policy: default-src 'none'`. SVG is refused (it can carry scripts).
- **Custom CSS** is only accepted on plans with `custom_css`, capped at 5,000 characters, and stripped of `</style`, `@import`, `url(`, `expression(`, `javascript:` and `<`. It only applies inside the widget's Shadow DOM.

## 6. Troubleshooting

| Symptom | Fix |
|---|---|
| Nothing appears | Check the browser console for `[Replyvoo]` messages. Make sure the script has `data-key` and the page's domain is in **Allowed domains**. |
| Console says "not allowed to use this chat" | Add the exact domain (or `*.domain`) in Widget Studio → Domains & install, then Save. |
| "Chat is offline right now" | The admin switched Website chat off (Channels & features), or the workspace is suspended. |
| "This chat is paused" | The plan has fewer website slots than widgets. Upgrade or add the Website chat power-up. |
| AI never answers, only "someone will reply" | No Closer is assigned, the Closer is paused, the chat was taken over in Pulse Inbox, or the workspace is out of conversations and credits. |
| "Check installation" says not seen | Open a page of your site with the code installed (not a cached copy), then check again. It updates at most once a minute. |
| Fonts look different | Custom fonts load from Google Fonts. If your site blocks third-party fonts (CSP), choose "System default". |
| Your site uses a strict Content-Security-Policy | Allow `script-src` and `connect-src` for your Replyvoo URL, and `font-src https://fonts.gstatic.com` / `style-src https://fonts.googleapis.com` if you use a Google font. |
