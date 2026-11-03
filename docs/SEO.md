# SEO guide

Replyvoo is positioned as a **multi-channel AI sales and support agent** ("AI Closer") for the chat apps where customers buy. Telegram is live; WhatsApp, Instagram, TikTok and Messenger are "coming soon". The website targets high-intent searches for every channel while staying truthful: a channel's status always comes from the admin flag, never from hardcoded copy.

## What was done

**Global defaults** (`src/services/settings.js` → `DEFAULTS.seo`, editable in Admin → Company & SEO)
- Title: `Replyvoo | AI Sales Agent for Telegram, WhatsApp & Instagram` (60 chars)
- Description (146 chars) mentions Telegram live and WhatsApp, Instagram, TikTok coming soon
- Keyword list covering Telegram, WhatsApp, Instagram, TikTok and Messenger automation, AI sales agent, AI customer support agent, chat automation for small business, auto reply bot, AI closer
- Hero sub-headline in all 6 languages, homepage FAQ and the announcement bar now read multi-channel

**New pages** (server-rendered, in the sitemap, linked from the main nav, footer "Channels" column, homepage hero strip and homepage channel tiles)
- `/channels` hub (ItemList + BreadcrumbList JSON-LD)
- `/telegram-ai-chatbot`, `/whatsapp-ai-chatbot`, `/instagram-dm-automation`, `/tiktok-dm-automation`, `/messenger-ai-chatbot`
- Each has its own title (≤60 chars) and meta description (≤160 chars), keywords, canonical, Open Graph/Twitter tags, exactly one H1 containing the keyword, a Live / Coming soon badge, an animated chat mock in the channel's colour, roughly 1,100 to 1,400 words of copy (what the agent does, setup steps, platform rules, use cases by business type, manual vs AI comparison, FAQ), related blog posts, and JSON-LD: `Organization`, `Service`, `BreadcrumbList`, `FAQPage`
- Copy: `views/site/channel-content.js`. Template: `views/site/channels.js`

**Homepage**
- `Organization` JSON-LD: Replyvoo, with Zedapex as `parentOrganization`, logo, and a `contactPoint` with the support email
- `SoftwareApplication` JSON-LD now has a multi-channel `featureList` (follows the flags) and `keywords`
- Channels section H2: "One AI team for Telegram, WhatsApp, Instagram and TikTok" (built from the flags); each tile links to its landing page with descriptive anchor text

**Other pages**
- Pricing title/description are multi-channel
- Blog index description is multi-channel; `/blog/rss.xml` (RSS 2.0, latest 20 posts) with `<link rel="alternate" type="application/rss+xml">` on every page while the blog is on
- Breadcrumb JSON-LD on blog articles, legal pages, `/legal`, `/contact` and channel pages
- 4 new articles: `whatsapp-ai-chatbot-for-business-guide`, `instagram-dm-automation-guide`, `tiktok-dm-automation-for-business`, `telegram-vs-whatsapp-for-selling` (internal links to the channel pages and `/pricing`)

**Technical**
- Sitemap lists `/channels` and every channel page that is not `off`, with `lastmod` (`UPDATED` in `channel-content.js`) and priority (0.9 live, 0.8 coming soon)
- `<html lang>` follows the language on the homepage; `og:locale` matches it; `og:site_name`, `twitter:card=summary_large_image`, `theme-color` on every page
- Every page has exactly one H1 (checked by tests for channel pages)
- If a channel is switched `off`, its page returns 404 and disappears from the nav, footer, homepage, hub, sitemap and JSON-LD; links to it inside blog posts are rewritten to `/channels`

## Keyword map

| Page | Primary keyword | Supporting keywords |
|---|---|---|
| `/` | AI sales agent | AI customer support agent, AI chatbot for small business, chat automation, AI closer, omnichannel AI chatbot |
| `/channels` | AI chatbot for Telegram, WhatsApp, Instagram & TikTok | omnichannel AI sales agent, messaging automation |
| `/website-ai-chatbot` | AI chatbot for website | website chatbot, AI chat widget, chatbot for small business website, website lead capture chatbot, Shopify/WordPress AI chatbot |
| `/telegram-ai-chatbot` | Telegram AI chatbot | Telegram bot for business, Telegram auto reply, Telegram Business chatbot, Telegram group moderation bot |
| `/whatsapp-ai-chatbot` | WhatsApp AI chatbot | WhatsApp business automation, WhatsApp chatbot for business, WhatsApp auto reply, WhatsApp Business API chatbot |
| `/instagram-dm-automation` | Instagram DM automation | Instagram auto reply, Instagram AI chatbot, comment to DM, story reply automation |
| `/tiktok-dm-automation` | TikTok DM automation | TikTok Business Messaging, TikTok auto reply, TikTok lead generation, TikTok ads leads |
| `/messenger-ai-chatbot` | Messenger AI chatbot | Facebook Messenger chatbot, Facebook Page auto reply, Messenger automation |
| `/pricing` | AI sales agent pricing | AI chatbot pricing, pay per conversation |
| `/blog/whatsapp-ai-chatbot-for-business-guide` | WhatsApp AI chatbot for business | WhatsApp 24-hour window, template messages, WhatsApp Business API |
| `/blog/instagram-dm-automation-guide` | Instagram DM automation guide | Instagram comment to DM, auto reply Instagram DMs |
| `/blog/tiktok-dm-automation-for-business` | TikTok DM automation for business | TikTok Business Messaging, TikTok ads leads |
| `/blog/ai-chatbot-for-website-guide` | AI chatbot for website guide | add chatbot to website, website chat lead capture, human-like reply timing |
| `/blog/telegram-vs-whatsapp-for-selling` | Telegram vs WhatsApp for business | best messaging app for sales |

Give each page one job. Don't add a second page that targets the same primary keyword; improve the existing one instead.

## How to edit SEO

- **Homepage title, description, keywords, share image:** Admin → **Company & SEO**. Keep titles under about 60 characters and descriptions under about 160. Once saved, your values override the defaults in `settings.js`.
- **Homepage hero, FAQ and announcement bar:** Admin → **Homepage** (hero per language).
- **Blog posts:** Admin → **Blog**. Each post has its own title, description and keywords. Link to the channel pages with descriptive text ("WhatsApp AI chatbot", not "click here").
- **Channel pages:** edit `views/site/channel-content.js` (title, description, keywords, H1, sections, FAQ). Bump `UPDATED` so the sitemap `lastmod` changes. Never write "available now" or "coming soon" into this copy: the template adds status wording from the flag.
- **New blog posts from files:** add `content/blog/<slug>.md` and run `npm run seed`. On an existing database only new slugs are inserted; existing posts are kept (use `--force-content` to overwrite).

## Google Search Console and sitemap

1. Make sure `APP_URL` is your real `https://` domain; canonicals, sitemap and JSON-LD all use it.
2. Open [Google Search Console](https://search.google.com/search-console), add a **Domain** property for your domain and verify it with the DNS TXT record Google gives you.
3. In **Sitemaps**, submit `https://YOUR-DOMAIN/sitemap.xml`. `robots.txt` already points to it.
4. Use **URL inspection** on `/`, `/channels` and each channel page, then click **Request indexing**.
5. Check **Enhancements** for FAQ and Breadcrumb results and fix any warnings. You can also test a page with Google's Rich Results Test.
6. Do the same in **Bing Webmaster Tools** (it can import from Search Console).
7. Review **Performance** monthly: queries where a page ranks 8 to 20 are the best candidates for better copy, FAQ entries or a supporting blog post.

## When WhatsApp, Instagram or TikTok goes live

1. Build, test and get the platform's approval first (see `docs/CHANNELS.md`). Replace the generic icon in `brandIcon()` with the official logo from the brand's press kit.
2. Admin → **Channels & features** → set the channel to **Live**.
3. That's it for the channel page: the badge turns to "Live now", headings switch from "will do" to "does", the waitlist becomes **Start free**, the availability FAQ answers "Yes", and the homepage hero strip, hub, footer and JSON-LD `featureList` update.
4. Update the text you wrote yourself: the homepage hero sub-headline (all languages), the homepage FAQ answer about WhatsApp/Instagram/TikTok, the announcement bar, and the SEO description if it says "coming soon".
5. Email the channel's waitlist (Admin → Activity → Waitlist export) and publish a launch post linking to the channel page.
6. In Search Console, request indexing for the channel page again.

## Website chat page (/website-ai-chatbot)

- Same template as the other channel pages (`views/site/channel-content.js` entry `website` + `views/site/channels.js`), status from `flags.channels.website`. Title "AI Chatbot for Website: Answers & Leads 24/7 | Replyvoo", one H1, ~1,300 words, breadcrumbs, `Service` + `FAQPage` + `BreadcrumbList` JSON-LD.
- Extra install section (snippet, platforms) and the "Which plans include website chat?" answer are built from the database (`websitePricing()` in `src/routes/pages.js`: first plan with `website_sites > 0` and the `website-chat` power-up price), so price changes in admin show up automatically.
- Listed in the /channels hub, header Channels menu, footer, sitemap, and linked from the homepage "Website chat" section and the blog guide.

