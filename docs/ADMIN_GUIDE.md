# Admin guide (for the owner)

This guide shows you how to run Replyvoo from the admin panel. No coding needed. Every change you save goes live on the website and in customers' dashboards **immediately**.

## Logging in

1. Go to **https://your-domain/admin** (e.g. https://replyvoo.com/admin).
2. Log in with your admin email and password. (Your programmer created it with `npm run seed` or `npm run create-admin`.)
3. Forgot your password? Use **https://your-domain/app/forgot**, or ask your programmer to run `npm run create-admin -- your@email.com "NewPassword" "Your Name"`.

On a phone the menu is at the bottom (Home, Plans, Site, Users, **More**). On a computer it is on the left.

Tip: open the website in another tab while you edit, and refresh it to see your changes.

---

## Overview

Your daily dashboard: monthly recurring revenue (MRR), paying customers, revenue in the last 30 days, sign-ups and revenue chart, AI replies and chats today, Joinvoo clicks, waitlists, recent orders.

- A **yellow banner "USDT orders waiting"** means someone paid (or says they paid) in crypto. See "Mark a USDT payment as paid" below.
- A **red banner "Demo payments are ON"** means anyone can get paid plans for free. Tell your programmer immediately.
- **Setup health** shows whether AI, email and payments are connected.

---

## Pricing

### Change a price
1. **Plans** → tap the plan (e.g. "Pro").
2. Change **Monthly price** and/or **Yearly total price** (the full amount for 12 months, e.g. 490).
3. Check the **Website preview** on the right, then **Save plan**.

Customers who already paid keep what they paid until their period ends. The new price applies to new purchases.

### Add an offer with an end date
1. **Plans** → tap the plan → **Offer** section.
2. **Offer label**: e.g. "Black Friday: 30% off". **Percent off**: e.g. 30 (max 90).
3. **Offer ends**: pick a date and time, or tap **+24 hours** / **+7 days**.
4. **Save plan**. The website shows the old price crossed out and a countdown. When the end date passes, the normal price comes back by itself.
5. To stop it early: **Remove offer**, then save.

### Pause or add a plan
- **Pause**: flip the switch on the right of the plan row. The plan disappears from the website and checkout. Customers already on it keep it until their period ends. You can't pause the free plan.
- **Add**: **New plan** → fill in name, prices, limits (Closers, conversations per month, team seats, Pro Brain chats), the features list (one line each) and the button text → **Create plan**.
- **Reorder**: drag rows, or use the up/down arrows.
- **Popular** = dark highlighted card. **Elite** = black-and-gold card. **Contact sales** = shows "from $X" and sends people to the sales form instead of checkout.
- **Delete** only works for plans nobody is on. Pause instead.

### Credit packs
**Credit packs** → add or edit: credits, bonus credits, price (USD), label (e.g. "Best value"). Switch off to hide.

### Power-ups
**Power-ups** → add-ons like "Extra Closer", "Extra seat", "Done-for-you setup". Status: **Live** (buyable if it has a price above $0), **Coming soon** (shown, not buyable), **Off** (hidden). "Price text" is just what the website shows. Only "extra-closer" and "extra-seat" are applied automatically; for others (like Done-for-you setup) you'll see the paid order in **Orders** and deliver the service yourself.

### Create a coupon
1. **Coupons** → **New coupon**.
2. **Code**: type one (e.g. `LAGOS30`) or tap **Generate**.
3. **Discount type**: Percent off or Fixed $ off, and the value.
4. **Applies to**: Everything, Plans (optionally only some plans), or Credit packs.
5. **Max uses** (0 = unlimited), **Expires** (empty = never), **First purchase only** if it's a welcome offer.
6. **Save**. Share the code. You can pause it with the switch and see how many times it was used.

Two coupons exist from the start: `WELCOME20` (20% off a first paid plan) and `VOO10` ($10 off a credit pack).

---

## Website

### Edit homepage text (per language)
1. **Homepage**.
2. **Announcement bar**: the thin strip at the top. Switch on/off, text, link text, link.
3. **Hero**: tap a language (EN, FR, PT, ES, SW, AR), then edit the badge, headline, italic part, sub text and button texts. The preview shows how it looks. Arabic is shown right-to-left.
4. **Live counter**: where the "replies sent" number in the hero starts.
5. **FAQ**: add, edit, reorder, remove questions.
6. **Final call to action**: the big banner at the end.
7. Press **Save** at the bottom.

Visitors see a language with `?lang=fr` (etc.) in the address, or by choosing it on the site.

### Hide homepage sections
**Homepage → Sections**: switch off any section (Slow-reply leak, Staff vs Closer, Savings calculator, How it works, Channels, Meet the Closers, Features, Juno, Voo Wallet, Pricing, Voo Squad, Blog, FAQ, Final call to action). Save.

### Turn WhatsApp / Instagram / TikTok / Messenger to Live, Coming soon or Off
**Channels & features → Channels**. Each switch saves instantly.
- **Coming soon**: shown with a waitlist button. The number of people waiting appears on the card.
- **Off**: hidden everywhere.
- **Live**: shown as available.

> **Important:** setting WhatsApp, Instagram, TikTok or Messenger to **Live** does **not** make them work. Today only Telegram is built. "Live" for those only changes what customers see. Each channel needs development work and approval from Meta or TikTok first (see `docs/CHANNELS.md`). Keep them on "Coming soon" until your programmer says the integration is finished and approved.

The three Telegram switches (bots, Business, groups) really turn those features on and off.

**Channel pages on the website follow these switches automatically.** Each channel has its own Google-friendly page (`/telegram-ai-chatbot`, `/whatsapp-ai-chatbot`, `/instagram-dm-automation`, `/tiktok-dm-automation`, `/messenger-ai-chatbot`) plus the hub at `/channels`:
- **Coming soon** → the page shows a "Coming soon" badge, a waitlist form and "Start on Telegram today".
- **Live** → the badge turns to "Live now" and the buttons become "Start free". Nothing else to edit.
- **Off** → the page returns "not found" and disappears from the menu, footer, homepage, `/channels` and the sitemap.

The text on these pages lives in `views/site/channel-content.js` (ask your programmer to edit it). The homepage hero sentence ("Live on Telegram today, with WhatsApp, Instagram and TikTok coming next") and the announcement bar are normal settings: update them in **Homepage** when a channel goes live. See `docs/SEO.md`.

### Website chat (the widget customers put on their own sites)

- **Turn it on or off:** Channels & features → **Website chat** → Live, Coming soon or Off. Anything but Live switches every customer widget to a friendly "Chat is offline right now" state and stops new widgets being created. Off also hides the /website-ai-chatbot page.
- **Which plans include it:** Pricing → edit a plan → **Website chat**:
  - *Website chat sites* – how many websites the plan can run (0 = locked, 999 = every site). Defaults: Pro 1, Business 3, Titan 10, Black 999, the rest 0.
  - *Remove branding* – lets customers hide "Powered by Replyvoo".
  - *Custom CSS* – lets customers add their own CSS to the widget.
  - Add a feature line such as "Website AI chat (1 site)" so the pricing page shows it.
- **The power-up:** Pricing → Power-ups → **Website chat** ($29, status Live). Each purchase gives one extra site for 30 days on any plan. Set its status to Off to stop selling it.
- **Homepage section:** Homepage → Sections → **Website chat** (the animated demo).
- Replyvoo's own chat bubble ("Chat with Juno") is the same widget. It follows **Website chat bubble** under Features, and Juno's answers follow the support bot prompt.

### Turn features off
**Channels & features → Features**. Each switch saves instantly:
New sign-ups, Agent Studio, Live Room, Blast, Juno, Voo Wallet, Voo Squad referrals, Joinvoo promo, Pro Brain, Voice notes & images, Blog, Website chat bubble, Nudge, Night Shift Report.

For example, switch off **New sign-ups** to pause new accounts during a busy launch.

### Maintenance mode
**Channels & features → Maintenance mode**. When on, the website and every customer dashboard show "We'll be right back". You (admins) can still use everything. Customers' Closers **keep replying** on Telegram in the background. Remember to switch it off.

### Company & SEO
**Company & SEO**:
- **Company**: product name, legal name, address, support/legal/privacy emails (used in emails, footer and legal pages).
- **SEO**: the title and description Google shows for the **homepage** (a preview is shown; keep the title under ~60 characters and description under ~160), keywords, share image. Once you save here, your saved text replaces the built-in default. Channel pages, pricing and blog posts have their own titles. See `docs/SEO.md` for the keyword map.
- **Joinvoo**: show/hide the Joinvoo promo in dashboards, its link, UTM tags, headline and pitch.
- **Website chat bot**: the instructions for the chat bubble on the website.

### Write a blog post
1. **Blog** → **New post**.
2. Title, link (slug, made from the title if empty), short description (shown on Google), category, cover style, keywords, read time.
3. Write the body in **Markdown**: `## Heading`, `**bold**`, `- list item`, `[link text](https://...)`, `![image description](/img/screens/inbox.png)`. The preview shows the result.
4. **Status**: Draft (hidden) or Published. **Published date** in the future = scheduled. **Featured** = shown first on the blog page.
5. **Save post**.

### Edit legal pages
**Legal pages** → tap a page (Terms, Privacy, Acceptable use, Refunds, Cookies, DPA, Referral terms, Disclaimer) → edit in Markdown → **Save page**.

> The legal pages are **drafts**, already filled with Zedapex Limited, Lagos, the replyvoo.com contact emails and the $300 Voo Squad minimum. Have a lawyer review them before launch.

---

## Business

### Users & workspaces
Search by email, name or business name. Tap a user to:
- **Suspend** (logs them out and blocks login), **make admin**, mark email verified.

Tap their workspace to:
- Change **Plan**, **Period ends** (e.g. give someone an extra week), **status** (Suspended = their Closers stop replying).
- **Extra Closer slots**, **Extra seats** (free gifts).
- **Reset usage now** (gives back this month's conversations).

### Add credits to a customer
1. **Users & workspaces** → find the customer → open their workspace.
2. **Credits (+/−)**: type e.g. `500` to add or `-100` to remove.
3. **Reason**: e.g. "Sorry for the outage" (the customer sees it in their wallet history).
4. **Save workspace**. When you add credits, the customer gets a "credits added" email.

### Orders
All purchases with status (pending, paid, cancelled, expired), amount, provider and customer. Use the chips at the top to filter (expired orders, i.e. card checkouts abandoned for 48 hours, show under **All**). Any pending order has **Mark paid** and **Cancel** buttons; for Paystack/Flutterwave orders, only use Mark paid if you confirmed the payment in the provider's dashboard.

### Mark a USDT payment as paid
1. Check your crypto wallet: the exact amount arrived, ideally with the order reference (e.g. `RV-LZ3K…`) in the customer's message.
2. **Orders** → find the pending USDT order → **Mark paid**.
3. Paste the transaction hash in **Note** → **Mark paid**.
The customer gets their plan/credits and a receipt immediately. If no money arrived, **Cancel** the order instead.

Only mark an order paid after you see the money. It can't be undone from the panel.

### Billing rules
- **Conversations**: AI replies per conversation (default 10) and the window (default 24 hours). **Free plan**: where new sign-ups start.
- **Voo Credits**: credit value ($0.03, used for referral rewards), credits for an extra Closer, people per credit for Blasts, extra credits for Pro Brain chats over the plan, low-credit warning level, sign-up bonus, bonus for invited friends.
- **Voo Squad tiers**: the share referrers earn (default 20%, 25% from 10 paying friends, 30% from 50).
- **Currencies**: Paystack currency (default NGN), Flutterwave currency (default USD) and exchange rates (1 USD = …). **Update the NGN rate regularly**: local prices = USD price × rate.
- **Crypto (USDT)**: switch on, wallet address, network.

---

## Messages

### Preview and test emails
1. **Emails** → **Templates** → tap one (e.g. "Payment receipt").
2. See it at phone and desktop width.
3. **Send a test** to your own email (uses sample data).
4. **Email log** (bottom) shows every email sent, and the error if one failed.

If you see "Emails aren't really sent yet", email isn't connected (ask your programmer).

### Send a broadcast (announcement email)
1. **Emails** → **Broadcast**.
2. **Subject** and **Message** (Markdown).
3. **Send to**: Everyone, Paying, or Free plan.
4. Tap **Send to me first** and check the email.
5. Then **Send broadcast** and confirm. Emails go out one by one over the next minutes. Every broadcast has an unsubscribe link; people who unsubscribed are skipped automatically.

Don't restart the server while a big broadcast is going out.

### Activity: Joinvoo clicks, waitlists, contact messages
**Activity** has four tabs:
- **Clicks**: Joinvoo clicks by source (dashboard, email, website…) and Voo Squad referral link clicks.
- **Waitlist**: who wants WhatsApp, Instagram, TikTok, Messenger, plus newsletter sign-ups. **Export CSV** to download.
- **Messages**: contact form and "talk to a human" messages from the website. Tap **Reply** to answer by email.
- **Audit log**: every change made by admins.

---

## Good habits

- Check **Overview** and **Orders** every day.
- Update exchange rates when the naira moves.
- Test any big pricing change on the website before announcing it.
- Keep at least two admin accounts (in case one gets locked out).
- Never share your admin password. Use a password manager.
