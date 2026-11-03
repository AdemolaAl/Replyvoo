'use strict';
// Copy for the channel landing pages (/telegram-ai-chatbot, /whatsapp-ai-chatbot, ...).
// Status (live / soon / off) is NOT stored here: it always comes from flags.channels in admin,
// and the template switches badges, headings, CTAs and the availability FAQ automatically.
// Keep platform rules phrased as "current rules" — Meta and TikTok change them often.

const UPDATED = '2026-10-03'; // sitemap <lastmod> for these pages; bump when you edit the copy

const PAGES = [
  {
    id: 'telegram', slug: 'telegram-ai-chatbot', name: 'Telegram', keyword: 'Telegram AI chatbot',
    title: 'Telegram AI Chatbot for Sales & Support | Replyvoo',
    description: 'Put an AI chatbot on your Telegram bot, groups and personal account. Replyvoo answers in seconds, qualifies leads and sends payment links. Start free.',
    keywords: 'telegram ai chatbot, telegram bot for business, telegram auto reply, telegram business chatbot, ai telegram bot, telegram group moderation bot, telegram sales bot',
    color: '#2AABEE', tint: '#E9F6FD', bub: '#CDEBFB', bubInk: '#0B3954',
    h1a: 'The Telegram AI chatbot', h1b: 'that closes sales.',
    leadLive: 'Replyvoo puts AI Closers on your Telegram bot, your groups and even your personal account. They answer every message in seconds, qualify the lead, send the payment link and hand tricky chats to your team. Live today, set up in about five minutes.',
    leadSoon: 'Replyvoo puts AI Closers on your Telegram bot, your groups and your personal account. They answer in seconds, qualify every lead and send the payment link.',
    platform: 'the Telegram Bot API',
    chat: { who: 'Glow Lab Store', sub: 'bot · replies instantly', av: 'GL', msgs: [
      ['in', 'Hi! Do you still have the Vitamin C serum?'],
      ['out', 'Yes, it’s in stock 🙌 The 30ml bottle is $48. Is it for oily or dry skin?'],
      ['in', 'Oily, and I want delivery to Accra'],
      ['out', 'Perfect match. Delivery to Accra is 2 days. Add the gentle cleanser and get both for $64?'],
      ['in', 'Ok bundle it'],
      ['pay', 'Pay $64 →'],
      ['out', 'Paid ✓ Order #GL-2291 ships today. Thank you, Daniel!']
    ] },
    does: [
      ['bolt', 'Replies in seconds, day and night', 'Your Closer answers every private chat, group mention and bot message the moment it lands, at 3 a.m. or on a public holiday. The lead you paid for gets an answer while they are still holding their phone.'],
      ['fire', 'Qualifies every lead', 'It asks the questions your best salesperson would ask: budget, product, location, timing. HeatScore marks each person Hot, Warm or Cold, so you know who to call first.'],
      ['card', 'Sends payment links and reads receipts', 'When the buyer is ready, the Closer drops a PayLink or your own checkout link. If they pay by transfer and send a screenshot, it reads the amount and flags the order.'],
      ['inbox', 'Hands over to a human with full context', 'Angry customer, refund, big order? You choose the triggers. The chat lands in Pulse Inbox with the whole history and your team takes over in one tap.'],
      ['clock', 'Follows up so leads do not go cold', 'Nudge sends a friendly reminder to people who asked for the price and went quiet. Blast reaches everyone who started your bot, with an opt-out on every message.'],
      ['globe', 'Speaks your customer’s language', 'English, French, Portuguese, Spanish, Swahili, Arabic and more. It also understands voice notes, so customers can talk instead of type.']
    ],
    setupIntro: 'There is nothing to install and no code. You connect Telegram once, pick a Closer and paste what it should know.',
    setup: [
      ['Create a bot with @BotFather', 'Open @BotFather in Telegram, send /newbot, choose a name and a username ending in “bot”. BotFather gives you a token. That is your bot’s key.'],
      ['Paste the token into Replyvoo', 'In your dashboard, open Channels → Telegram bot and paste the token. Replyvoo checks it and connects the webhook for you. Your bot is now online.'],
      ['Add the bot to your groups (optional)', 'Add the bot to a group and make it an admin. Your Closer can welcome new members, answer questions in the thread and remove spam links.'],
      ['Connect your personal account (optional)', 'With Telegram Premium, go to Settings → Telegram Business → Chatbots and enter your bot’s username. Choose which chats it may answer. Your Closer now replies from your own account.'],
      ['Pick a Closer and teach it', 'Start from a template (sales, support, group guard), paste your FAQ, prices and product list, and test it in the preview. Switch it on when you are happy.']
    ],
    rules: [
      'Telegram bots cannot message someone first. A customer has to start the chat or tap your link, which keeps your bot spam-free.',
      'In groups, a bot sees every message only when it is an admin or its privacy mode is off. Replyvoo walks you through this.',
      'Telegram Business needs Telegram Premium on the account you connect. You choose exactly which chats the Closer handles.',
      'Broadcasts go only to people who started your bot, and every Blast includes a way to stop receiving them.'
    ],
    uses: [
      ['E-commerce stores', 'Price checks, stock questions, delivery fees and order status answered from your catalog, then a payment link in the same chat.'],
      ['Coaching and online courses', 'The Closer explains your programme, handles “is this for me?” objections and sends the enrolment link to qualified students.'],
      ['Trading academies and communities', 'Welcome new members, answer onboarding questions in your group and route VIP upgrade questions to sales. No promises of profit, only your approved answers.'],
      ['Real estate', 'Ask budget, area and move-in date, share matching listings and book viewings for your agents.'],
      ['Beauty and fashion', 'Recommend the right shade or size, upsell bundles and confirm bookings without you living in your inbox.']
    ],
    vs: [
      ['First reply time', 'Minutes to hours', 'Seconds, 24/7'],
      ['Leads handled at once', 'One per agent', 'Every chat at the same time'],
      ['Follow-ups', 'When someone remembers', 'Automatic Nudges'],
      ['Group moderation', 'Manual, after the damage', 'Spam removed instantly'],
      ['Night and weekend sales', 'Lost', 'Closed'],
      ['Cost as you grow', 'Another salary', 'Pay per conversation']
    ],
    faq: [
      ['Can the Telegram AI chatbot reply from my personal account?', 'Yes. Telegram Business lets a bot answer chats on your personal account. You need Telegram Premium, then you add your Replyvoo bot under Settings → Telegram Business → Chatbots and choose which chats it may answer.'],
      ['Does it work in Telegram groups and channels?', 'It works in groups and supergroups: it answers questions, welcomes members and removes spam when it is an admin. Telegram channels are one-way broadcasts, so there is nothing to reply to there, but your Closer can answer the discussion group linked to a channel.'],
      ['Do I need to know how to code?', 'No. You create the bot with @BotFather, paste one token and pick a template. Most people are live in about five minutes.'],
      ['Can it take payments?', 'It sends payment links (PayLink or your own checkout) and can read a receipt screenshot to flag an order as paid. You stay in control of refunds and disputes.'],
      ['What if the AI does not know an answer?', 'It says so politely and hands the chat to your team in Pulse Inbox. Add the missing answer to its knowledge once and it will use it from then on.'],
      ['How much does it cost?', 'There is a free plan. Paid plans are priced per conversation, not per message, so a long sales chat costs the same as a short one.']
    ],
    posts: ['connect-telegram-bot-botfather', 'ai-closer-on-personal-telegram-business', 'telegram-vs-whatsapp-for-selling']
  },
  {
    id: 'website', slug: 'website-ai-chatbot', name: 'Website chat', keyword: 'AI chatbot for website',
    title: 'AI Chatbot for Website: Answers & Leads 24/7 | Replyvoo',
    description: 'Add an AI chatbot to your website with one line of code. It answers visitors in seconds, sounds human, captures leads and hands chats to your team.',
    keywords: 'ai chatbot for website, website chatbot, ai chat widget, live chat ai, chatbot for small business website, ai customer service chatbot, website lead capture chatbot, shopify ai chatbot, wordpress ai chatbot',
    color: '#FFC21A', tint: '#FFF7DD', bub: '#FFE58A', bubInk: '#3B3000',
    h1a: 'The AI chatbot for your website', h1b: 'that sells like your best rep.',
    leadLive: 'Visitors leave when nobody answers. Replyvoo puts an AI Closer on your website as a chat bubble in your colours. It answers in seconds with a natural, human pace, captures the lead, and hands the chat to your team the moment a person should step in. One line of code, live today.',
    leadSoon: 'Replyvoo will put an AI Closer on your website as a chat bubble in your colours, answering visitors in seconds and capturing every lead.',
    platform: 'your own website with one script tag',
    chat: { who: 'Glow Labs', sub: 'website chat', av: 'GL', msgs: [
      ['in', 'Do you ship to Spain?'],
      ['out', 'Yes! Spain gets delivery in 2 to 4 days, and shipping is free over $50.'],
      ['in', 'Nice, which serum for oily skin?'],
      ['out', 'The Vitamin C Serum is light and great for oily skin. It’s $24, or $38 in the Glow Bundle. Want the link?']
    ] },
    does: [
      ['bolt', 'Answers every visitor in seconds', 'A visitor with a question is a buyer with a doubt. Your Closer answers prices, stock, delivery and returns straight from your knowledge base, at 3 a.m. or in the middle of a sale, while they are still on the product page.'],
      ['chat', 'Sounds human, not robotic', 'You choose the reply pace. A short pause and a typing indicator that scales with the answer length make it feel like a real person is typing, never an instant wall of text.'],
      ['fire', 'Captures the lead', 'Ask for name, email or phone after the first answer or before the chat starts. Leads land in Replyvoo with their HeatScore, so your team knows who to call first.'],
      ['inbox', 'You can jump in any time', 'Every website chat appears in Pulse Inbox next to your Telegram chats, with the page the visitor was on. Tap “Take over” and your reply shows up in their chat bubble within seconds.'],
      ['star', 'Your brand, not ours', 'Six ready-made looks or your own colours, your logo, your Closer’s photo, rounded or sharp corners, light or dark. On Business and up you can hide our branding and add custom CSS.'],
      ['globe', 'Speaks your visitor’s language', 'Spanish shoppers get Spanish answers, French shoppers get French. No translations to set up. The same Closer also answers on Telegram.']
    ],
    setupIntro: 'There is no plugin to maintain. You design the chat in Widget Studio, then paste one line of code.',
    setup: [
      ['Pick your Closer and its knowledge', 'Use a Closer you already have or build one in Agent Studio. Paste your FAQ, prices, delivery times and policies. That is what it answers from.'],
      ['Design the chat in Widget Studio', 'Choose a style, colours, logo, welcome message, quick replies and a proactive greeting. A live preview shows exactly what visitors will see on desktop and phone.'],
      ['Add your domain', 'The chat only loads on the domains you allow, like shop.example.com or *.example.com. Nobody can copy your chat onto another site.'],
      ['Paste one line of code', 'Copy the script tag and paste it before the closing body tag. Step-by-step guides cover HTML, WordPress, Shopify, Wix, Webflow and Google Tag Manager.'],
      ['Check installation and go live', 'Open your site, then press “Check installation”. Widget Studio confirms where the chat was seen and when.']
    ],
    rules: [
      'Domain lock: the chat answers only on the domains you add, so your conversation credits can’t be used from someone else’s site.',
      'The chat runs in its own Shadow DOM. Your theme can’t break it, and it can’t touch your page.',
      'Visitors see an “AI assistant” label by default, in line with the EU AI Act’s transparency rules, and a person can join anytime.',
      'Messages are plain text with safe links only. Uploaded images must be PNG, JPG or WebP.',
      'Each conversation is billed like any other channel: one conversation covers a visitor chatting for 24 hours.'
    ],
    uses: [
      ['Online stores', 'Answer size, stock, delivery and returns questions on the product page, suggest the bundle and send the checkout link before the visitor wanders off.'],
      ['Clinics, salons and studios', 'Explain treatments and prices, collect a phone number and pass booking requests to your front desk.'],
      ['Agencies and B2B services', 'Qualify enquiries by budget and timeline, capture the email and hand hot leads to sales with the whole conversation.'],
      ['Courses and coaching', 'Handle “is this for me?” questions on your sales page at any hour and share the enrolment link with qualified students.'],
      ['Real estate and travel', 'Ask dates, budget and location, share the right listings or trips and book a call for your agents.']
    ],
    vs: [
      ['First reply', 'A contact form and a wait', 'Seconds, 24/7'],
      ['Feels like', 'A ticket system', 'A helpful person typing'],
      ['Lead details', 'Lost when they leave', 'Saved with a HeatScore'],
      ['Nights and weekends', 'Nobody online', 'Covered'],
      ['Handover to your team', 'Email back and forth', 'Take over in one tap'],
      ['Setup', 'Plugins and developers', 'One line of code']
    ],
    faq: [
      ['How do I add the AI chatbot to my website?', 'Create the chat in Widget Studio, add your domain, then paste one script tag before the closing body tag. It works on any site where you can add custom code, including WordPress, Shopify, Wix, Webflow and Google Tag Manager.'],
      ['Which plans include website chat?', '{price}'],
      ['Will it slow down my website?', 'No. The script loads asynchronously after your page, renders in its own Shadow DOM and only fetches its settings. There is nothing to install on your server.'],
      ['Can my team reply instead of the AI?', 'Yes. Every website chat shows up in Pulse Inbox. Take over with one tap and your reply appears in the visitor’s chat bubble within seconds. Hand it back to the Closer whenever you like.'],
      ['Does it tell visitors they are talking to AI?', 'Yes, by default the chat shows an “AI assistant” label, and you can change the wording. Being upfront is good for trust and is what the EU AI Act asks for.'],
      ['Can visitors continue the chat on Telegram?', 'If you connect a Telegram bot, the chat can show a “Continue on Telegram” button so visitors can keep talking from their phone.']
    ],
    posts: ['ai-chatbot-for-website-guide', 'speed-to-lead-first-reply-wins', 'write-a-knowledge-base-your-closer-can-use']
  },
  {
    id: 'whatsapp', slug: 'whatsapp-ai-chatbot', name: 'WhatsApp', keyword: 'WhatsApp AI chatbot',
    title: 'WhatsApp AI Chatbot for Business Sales & Support | Replyvoo',
    description: 'An AI chatbot for WhatsApp Business that answers in seconds, qualifies leads and sends payment links, built on the official WhatsApp Business Platform.',
    keywords: 'whatsapp ai chatbot, whatsapp business automation, whatsapp chatbot for business, whatsapp auto reply, whatsapp business api chatbot, ai agent for whatsapp, whatsapp sales bot',
    color: '#25D366', tint: '#EDF8F0', bub: '#D2F4DC', bubInk: '#0D3B1E',
    h1a: 'The WhatsApp AI chatbot', h1b: 'for businesses that sell.',
    leadLive: 'Replyvoo puts AI Closers on your WhatsApp Business number through the official WhatsApp Business Platform. They answer in seconds, qualify every lead, send payment links and pass hot chats to your team.',
    leadSoon: 'AI Closers for WhatsApp are coming to Replyvoo through Meta’s official WhatsApp Business Platform. They will answer in seconds, qualify every lead and send payment links, while you keep a human one tap away.',
    platform: 'the WhatsApp Business Platform (Cloud API)',
    chat: { who: 'Casa Verde Homes', sub: 'business account', av: 'CV', msgs: [
      ['in', 'Hello, is the 2-bedroom in Westlands still available?'],
      ['out', 'Hi Sofia! Yes, it’s available from 1 November. Rent is $950 a month. Are you looking to move this month or next?'],
      ['in', 'Next month. Can I see it this weekend?'],
      ['out', 'Of course. Saturday 10:00 or 14:00 works for our agent. Which do you prefer?'],
      ['in', '10am please'],
      ['out', 'Booked ✓ Saturday 10:00 with Leo. I’ll send the pin and a reminder the day before.']
    ] },
    does: [
      ['bolt', 'Answers every WhatsApp message in seconds', 'Customers who tap “Message us” from your ad, website or Instagram bio get a real answer straight away, not “we’ll get back to you”. Fast replies inside WhatsApp’s 24-hour window are where most sales happen.'],
      ['fire', 'Qualifies leads before your team sees them', 'The Closer asks what they want, their budget and timing, then scores the lead. Your sales team only spends time on people ready to buy.'],
      ['card', 'Sends payment and booking links', 'Share a PayLink, your checkout page or a booking link in the chat. When the customer sends proof of payment, the Closer flags the order for your team.'],
      ['inbox', 'Hands over to a human instantly', 'Refunds, complaints and big orders go to Pulse Inbox with the full conversation, so your agent never asks the customer to repeat themselves.'],
      ['clock', 'Follows up the right way', 'Inside the 24-hour window, Nudges remind quiet leads. Outside it, follow-ups use Meta-approved templates sent only to customers who opted in.'],
      ['globe', 'Talks like your customers do', 'Replies in the customer’s language, understands voice notes and keeps your brand’s tone, from formal to friendly.']
    ],
    setupIntro: 'WhatsApp automation only works safely through Meta’s official platform. Here is how connecting will work.',
    setup: [
      ['Prepare your Meta Business portfolio', 'You will need a Meta Business portfolio (Business Manager) for your company. Completing business verification raises your messaging limits and helps your display name get approved.'],
      ['Connect your number with Embedded Signup', 'From your Replyvoo dashboard you log in with Facebook, create or pick a WhatsApp Business Account and register a phone number. You can use a new number or move an existing one, following Meta’s current rules.'],
      ['Get your display name approved', 'Meta reviews the business name customers see. Use your real brand name so approval is quick.'],
      ['Pick a Closer and teach it', 'Choose a sales or support template, paste your FAQ, prices and policies, and test it in the preview before going live.'],
      ['Add message templates for follow-ups', 'For messages outside the 24-hour window, such as order updates or reminders, you submit templates for Meta’s approval and only send them to opted-in customers.']
    ],
    rules: [
      'The 24-hour customer service window: when a customer messages you, your business can reply freely for 24 hours. After that, you can only send approved template messages.',
      'Template messages are paid. Meta charges per message, and the price depends on the category (marketing, utility, authentication) and the customer’s country.',
      'Opt-in comes first. You may only start conversations with people who agreed to hear from your business on WhatsApp.',
      'Under Meta’s current rules, bots that handle a business’s own sales and support are allowed, while general-purpose AI assistants are not. A Closer only talks about your business.',
      'Numbers that get blocked or reported a lot lose quality rating and messaging limits, so the Closer never spams.'
    ],
    uses: [
      ['E-commerce and social sellers', 'Turn “how much?” into a paid order: price, sizes, delivery fee and payment link in one WhatsApp thread.'],
      ['Real estate agencies', 'Qualify renters and buyers by budget, area and timing, share listings and book viewings straight into your agents’ calendars.'],
      ['Clinics, salons and beauty studios', 'Answer price questions, explain treatments and confirm appointments, with a human taking over anything sensitive.'],
      ['Coaching and online courses', 'Answer programme questions from ad traffic, handle objections and send enrolment links to people who are ready.'],
      ['Trading academies', 'Onboard students, answer course and schedule questions and route upgrades to your team, using only answers you approved. No profit promises.']
    ],
    vs: [
      ['First reply time', 'Hours on busy days', 'Seconds, 24/7'],
      ['Using the 24-hour window', 'Often missed', 'Every chat answered inside it'],
      ['Lead qualification', 'Inconsistent', 'Same questions, every time'],
      ['Follow-ups outside 24h', 'Copy-paste broadcasts', 'Approved templates to opted-in customers'],
      ['Account safety', 'Unofficial tools risk bans', 'Official Business Platform only'],
      ['Cost as you grow', 'More staff', 'Pay per conversation']
    ],
    faq: [
      ['Is a WhatsApp AI chatbot allowed under Meta’s rules?', 'Yes, when it serves your own customers. Meta’s current WhatsApp Business rules allow automated sales and support for your business, but not general-purpose AI assistants. Replyvoo Closers only answer from your business knowledge.'],
      ['Do I need the WhatsApp Business API?', 'Yes. Automating replies safely requires the WhatsApp Business Platform (Cloud API). Replyvoo connects you to it through Meta’s Embedded Signup, so you do not need a developer.'],
      ['Can I keep using my current WhatsApp number?', 'Usually yes, but the number has to be registered on the Business Platform. Depending on Meta’s current options you can move the number or use it alongside the WhatsApp Business app. We will guide you when you connect.'],
      ['What is the 24-hour window?', 'After a customer messages you, you can reply freely for 24 hours. Outside that window you can only send Meta-approved template messages, which Meta charges for.'],
      ['Will my customers know they are talking to AI?', 'You decide how the Closer introduces itself. We recommend being upfront, and the Closer always offers a way to reach a person.'],
      ['How is WhatsApp priced on Replyvoo?', 'Your Replyvoo plan counts conversations, the same as on Telegram. Meta’s own fees for template messages are separate and paid at Meta’s rates.']
    ],
    posts: ['whatsapp-ai-chatbot-for-business-guide', 'telegram-vs-whatsapp-for-selling', 'whatsapp-instagram-tiktok-coming-soon']
  },
  {
    id: 'instagram', slug: 'instagram-dm-automation', name: 'Instagram', keyword: 'Instagram DM automation',
    title: 'Instagram DM Automation with an AI Sales Agent | Replyvoo',
    description: 'Instagram DM automation that answers DMs, story replies and comments with AI, qualifies leads and sends links. Built on Meta’s official Instagram API.',
    keywords: 'instagram dm automation, instagram auto reply, instagram ai chatbot, instagram comment to dm, instagram story reply automation, auto reply instagram dms, instagram sales bot',
    color: '#E1306C', tint: '#FDEFF4', bub: '#FAD4E3', bubInk: '#5C0F2E',
    h1a: 'Instagram DM automation', h1b: 'that sounds like you.',
    leadLive: 'Replyvoo puts an AI Closer in your Instagram DMs. It answers messages, story replies and comment triggers in seconds, qualifies the lead and sends the link to buy or book, through Meta’s official Instagram API.',
    leadSoon: 'AI Closers for Instagram DMs are coming to Replyvoo through Meta’s official Instagram messaging API. They will answer DMs, story replies and comment triggers in seconds and send the link to buy or book.',
    platform: 'Meta’s Instagram messaging API',
    chat: { who: 'Luna Lash Studio', sub: 'professional account', av: 'LL', msgs: [
      ['story', 'Replied to your story'],
      ['in', 'How much for this set? 😍'],
      ['out', 'Hi Maya! That’s our Soft Volume set, $65 with a free refill within 2 weeks. Want to book?'],
      ['in', 'Yes, any slots Friday?'],
      ['out', 'Friday has 11:30 and 16:00 open. Tap here to grab one and pay the $15 deposit.'],
      ['pay', 'Book Friday →']
    ] },
    does: [
      ['bolt', 'Answers DMs while the post is hot', 'Reels and stories create a rush of messages in the first hours. Your Closer answers every one in seconds, so interest turns into bookings instead of “seen”.'],
      ['chat', 'Replies to story replies and mentions', 'When someone reacts to a story or mentions you, the Closer picks up the conversation with context about what they replied to.'],
      ['send', 'Comment-to-DM flows', 'Ask people to comment a keyword like “PRICE”. The Closer sends them one private reply in DMs, which Meta allows within days of the comment, and carries on the chat if they answer.'],
      ['fire', 'Qualifies and scores leads', 'It asks the right questions for your business, tags the lead and gives your team a clean list of hot prospects.'],
      ['card', 'Sends booking and payment links', 'Share your shop, booking page or PayLink. The Closer explains what happens next so the customer does not drop off.'],
      ['inbox', 'Hands over to your team', 'Collaborations, complaints and custom orders go to Pulse Inbox with the full thread. Your team replies as a human.']
    ],
    setupIntro: 'Instagram automation needs a professional account and Meta’s approval. This is how connecting will work.',
    setup: [
      ['Switch to a professional account', 'Your Instagram account must be a Business or Creator account. It takes a minute in Instagram settings and does not change your followers.'],
      ['Allow access to messages', 'In Instagram settings, under messages and connected tools, allow connected apps to access your messages so Replyvoo can read and reply to DMs.'],
      ['Log in with Instagram from Replyvoo', 'In your dashboard you connect the account through Meta’s official login. Some setups also link the Facebook Page connected to your Instagram account.'],
      ['Teach your Closer', 'Paste your prices, services, booking rules and FAQ. Add comment keywords if you want comment-to-DM flows.'],
      ['Go live and watch Pulse Inbox', 'Turn the Closer on and keep an eye on the first conversations. Fix any answer once and it sticks.']
    ],
    rules: [
      'Standard replies are allowed for 24 hours after the customer’s last message.',
      'A human agent can reply for up to 7 days using Meta’s human-agent tag. That tag is for people, not for automated replies.',
      'Comment-to-DM sends one private reply per comment, within the time Meta allows after the comment.',
      'No unsolicited promotional DMs. Instagram is a reply channel, so broadcasts to people who never messaged you are not allowed.',
      'Apps need Meta App Review before they can manage messages for other businesses’ accounts.'
    ],
    uses: [
      ['Beauty, lash and nail studios', 'Answer price questions from reels, show availability and take deposits, without living on your phone between clients.'],
      ['Fashion and boutiques', 'Sizes, colours, stock and delivery answered in seconds, with a checkout link while the outfit is still on their mind.'],
      ['Creators and coaches', 'Turn “link?” comments into DMs, explain your programme and send the sign-up link to warm followers.'],
      ['Restaurants and cafés', 'Reservations, menus, opening hours and event questions answered instantly, with a person for special requests.'],
      ['Real estate and travel', 'Qualify enquiries from listing posts by budget and dates and pass the serious ones to an agent.']
    ],
    vs: [
      ['Reply speed after a reel', 'Hours, if at all', 'Seconds'],
      ['Comment “PRICE” requests', 'Copy-paste one by one', 'Private reply sent automatically'],
      ['Story replies', 'Buried in Requests', 'Answered with context'],
      ['Evenings and weekends', 'Missed', 'Covered'],
      ['Lead details', 'Scattered in DMs', 'Scored and saved'],
      ['Account safety', 'Unofficial tools risk blocks', 'Official Meta API only']
    ],
    faq: [
      ['What is Instagram DM automation?', 'It means software replies to your Instagram direct messages for you. With Replyvoo, an AI Closer answers questions, qualifies leads and sends links, and passes the chat to a person when needed.'],
      ['Do I need a business account?', 'You need a professional account, which can be Business or Creator. Personal accounts cannot use Meta’s messaging API.'],
      ['Can it reply to comments?', 'It can send a private DM reply to someone who commented on your post, for example when they comment a keyword. Public comment replies are not part of the first release.'],
      ['Is Instagram auto reply allowed by Meta?', 'Yes, through the official API and within Meta’s rules: replies within 24 hours of the customer’s message, no unsolicited promotions, and a clear route to a human.'],
      ['Will it reply to every DM, including friends?', 'You choose. You can limit the Closer to new conversations, specific keywords or certain hours, and take over any chat yourself.']
    ],
    posts: ['instagram-dm-automation-guide', 'whatsapp-instagram-tiktok-coming-soon', 'speed-to-lead-first-reply-wins']
  },
  {
    id: 'tiktok', slug: 'tiktok-dm-automation', name: 'TikTok', keyword: 'TikTok DM automation',
    title: 'TikTok DM Automation & AI Lead Replies | Replyvoo',
    description: 'TikTok DM automation for business: an AI agent that answers DMs and leads from TikTok ads in seconds, via TikTok’s official Business Messaging API.',
    keywords: 'tiktok dm automation, tiktok business messaging, tiktok auto reply, tiktok ai chatbot, tiktok lead generation, tiktok ads leads follow up, tiktok business account dm',
    color: '#121110', tint: '#F3F2EF', bub: '#121110', bubInk: '#FFFFFF',
    h1a: 'TikTok DM automation', h1b: 'for viral moments.',
    leadLive: 'Replyvoo puts an AI Closer in your TikTok Business DMs. It answers messages and leads from your TikTok ads in seconds, qualifies them and sends the link to buy, through TikTok’s official Business Messaging API.',
    leadSoon: 'AI Closers for TikTok DMs are coming to Replyvoo through TikTok’s official Business Messaging API. They will answer DMs and leads from your TikTok ads in seconds, qualify them and send the link to buy.',
    platform: 'TikTok’s Business Messaging API',
    chat: { who: 'Peak Fit Coaching', sub: 'business account', av: 'PF', msgs: [
      ['in', 'Saw your video 🔥 how do I join the 8 week plan?'],
      ['out', 'Love that! Quick question so I point you right: are you training at home or in a gym?'],
      ['in', 'Home, I have dumbbells'],
      ['out', 'Then the Home Strong plan fits. 8 weeks, 4 workouts a week, $39 once. Want the link?'],
      ['in', 'yes'],
      ['pay', 'Join Home Strong →']
    ] },
    does: [
      ['bolt', 'Keeps up when a video takes off', 'A video can bring hundreds of DMs overnight. The Closer answers each one in seconds, so the buzz turns into customers before the next trend arrives.'],
      ['layers', 'Follows up leads from TikTok ads', 'Ads that send people to your DMs work only if someone answers. Your Closer greets them, asks the qualifying questions and gets them to the next step.'],
      ['fire', 'Qualifies and scores', 'It sorts curious viewers from real buyers and gives your team a short list of hot leads with their answers attached.'],
      ['card', 'Sends shop and booking links', 'Point buyers to your shop, checkout or booking page with clear next steps.'],
      ['inbox', 'Hands over to a person', 'Brand deals, complaints and custom requests go to Pulse Inbox with the full chat.'],
      ['globe', 'Speaks your audience’s language', 'TikTok audiences are global. The Closer answers in the language each viewer writes in.']
    ],
    setupIntro: 'TikTok gives API access for messaging to approved partners only, and only in some regions. This is how connecting will work.',
    setup: [
      ['Use a TikTok Business Account', 'Switch your account to a Business Account in TikTok settings. Personal and creator accounts cannot connect.'],
      ['Check that your region is supported', 'TikTok does not offer Business Messaging everywhere. At the time of writing, accounts registered in the EEA, the UK and Switzerland are excluded. We will show you if your account is eligible.'],
      ['Authorise Replyvoo', 'Connect your account through TikTok’s official login from your Replyvoo dashboard. Replyvoo can only read and reply to your business DMs.'],
      ['Teach your Closer', 'Add your products, prices, FAQ and the questions that tell you a lead is serious.'],
      ['Connect your ads', 'Run TikTok ads that send people to your DMs and let the Closer handle the conversations they start.']
    ],
    rules: [
      'TikTok sets a reply window after the customer’s last message (48 hours at the time of writing), with a cap on how many messages the business can send in it.',
      'Businesses cannot start conversations or send unsolicited messages. TikTok is a reply-only channel, so Blasts are not available.',
      'API access is granted only to approved partners after TikTok’s review.',
      'TikTok limits direct messages for younger users, so some viewers cannot message any account.'
    ],
    uses: [
      ['Fitness and coaching', 'Turn workout videos into sign-ups: ask about goals and equipment, then send the right programme link.'],
      ['E-commerce and dropshipping', 'Answer “where can I buy this?” and shipping questions from product videos, with a direct checkout link.'],
      ['Beauty and skincare', 'Recommend products by skin type and concern, and send people to the right bundle.'],
      ['Online courses', 'Explain what is inside the course, who it is for and how to start, then hand serious buyers the enrolment link.'],
      ['Local services', 'Quote prices, check availability and book appointments for viewers in your area.']
    ],
    vs: [
      ['DMs after a viral video', 'Hundreds left unread', 'Every DM answered'],
      ['Leads from TikTok ads', 'Answered next day', 'Answered in seconds'],
      ['Qualification', 'Guesswork', 'Scored with answers saved'],
      ['Reply window', 'Often missed', 'Used while it is open'],
      ['Languages', 'Only the ones you speak', 'Your viewer’s language'],
      ['Cost as you grow', 'More staff', 'Pay per conversation']
    ],
    faq: [
      ['What is TikTok Business Messaging?', 'It is TikTok’s official API that lets approved software read and reply to a Business Account’s direct messages, including conversations started from TikTok ads.'],
      ['Which TikTok accounts can use DM automation?', 'Business Accounts in supported regions. TikTok currently excludes some regions, including the EEA, the UK and Switzerland at the time of writing.'],
      ['Can the AI message people who did not DM me?', 'No. TikTok does not allow businesses to start conversations. The Closer only replies to people who messaged you, within TikTok’s reply window.'],
      ['Does it work with TikTok ads?', 'Yes. Ads that send people to your direct messages create conversations the Closer can answer, qualify and follow through.'],
      ['Is it safe for my account?', 'Replyvoo only uses TikTok’s official Business Messaging API. We never use scripts that pretend to be you in the app.']
    ],
    posts: ['tiktok-dm-automation-for-business', 'whatsapp-instagram-tiktok-coming-soon', 'fake-traffic-telegram-ads-joinvoo']
  },
  {
    id: 'messenger', slug: 'messenger-ai-chatbot', name: 'Messenger', keyword: 'Messenger AI chatbot',
    title: 'Facebook Messenger AI Chatbot for Business | Replyvoo',
    description: 'A Messenger AI chatbot for your Facebook Page: answers in seconds, qualifies leads, sends links and hands over to your team. Official Messenger Platform.',
    keywords: 'messenger ai chatbot, facebook messenger chatbot, facebook page auto reply, messenger automation, facebook messenger bot for business, ai chatbot for facebook page',
    color: '#6D5BFF', tint: '#F0EEFF', bub: '#6D5BFF', bubInk: '#FFFFFF',
    h1a: 'The Messenger AI chatbot', h1b: 'for your Facebook Page.',
    leadLive: 'Replyvoo puts an AI Closer on your Facebook Page inbox. It answers Messenger chats from posts, ads and your Page in seconds, qualifies the lead and sends the next step, through Meta’s official Messenger Platform.',
    leadSoon: 'AI Closers for Facebook Messenger are coming to Replyvoo through Meta’s official Messenger Platform. They will answer your Page’s messages in seconds, qualify every lead and send the next step.',
    platform: 'Meta’s Messenger Platform',
    chat: { who: 'Urban Threads', sub: 'Facebook Page', av: 'UT', msgs: [
      ['in', 'Hi, where is my order? It’s #UT-1184'],
      ['out', 'Hi James! Order #UT-1184 left our warehouse yesterday and should arrive Thursday. Want the tracking link?'],
      ['in', 'Yes please. Also do you have the denim jacket in M?'],
      ['out', 'Here’s your tracking link. And yes, the denim jacket is in stock in M for $72. Add it to a new order?'],
      ['pay', 'Shop the jacket →']
    ] },
    does: [
      ['bolt', 'Answers your Page inbox in seconds', 'Messages from your Page, posts and “Send message” ads get an instant, useful answer instead of an automatic “we’ll reply soon”.'],
      ['fire', 'Qualifies leads from Facebook ads', 'The Closer asks the questions that matter to you and scores each lead, so your team calls the right people first.'],
      ['card', 'Handles orders and links', 'Order status, delivery questions and payment links handled in the chat.'],
      ['inbox', 'Hands over to a human', 'Complaints, returns and big orders go to Pulse Inbox with the full history, and a person can reply for longer using Meta’s human-agent rules.'],
      ['clock', 'Follows up within the rules', 'Reminders go out inside Messenger’s 24-hour window, or later only where Meta’s message tags or opt-in allow it.'],
      ['globe', 'Multilingual by default', 'It replies in the language each customer writes in and keeps your brand’s tone.']
    ],
    setupIntro: 'Messenger automation runs on the Facebook Page you already have. This is how connecting will work.',
    setup: [
      ['Make sure you admin the Facebook Page', 'You need full control of the Page whose messages the Closer will answer.'],
      ['Log in with Facebook from Replyvoo', 'Connect the Page through Meta’s official login and grant messaging access. Replyvoo subscribes to the Page’s new messages.'],
      ['Teach your Closer', 'Paste your FAQ, products, prices and returns policy, or start from a template.'],
      ['Choose when a person takes over', 'Set the triggers that send a chat to your team: complaints, refunds, large orders or specific keywords.'],
      ['Switch it on', 'Turn the Closer on and watch the first conversations in Pulse Inbox.']
    ],
    rules: [
      'Messenger allows standard replies for 24 hours after the customer’s last message.',
      'Outside that window, only specific message tags are allowed, such as a human agent replying for up to 7 days. Promotions outside the window are not allowed.',
      'People must always be able to reach a human when a business uses automation.',
      'Apps that manage messages for other businesses’ Pages need Meta App Review.'
    ],
    uses: [
      ['Online stores', 'Order status, sizes, returns and payment links answered right inside Messenger.'],
      ['Local businesses', 'Opening hours, prices, directions and bookings answered for people who find you on Facebook.'],
      ['Real estate', 'Qualify enquiries from listing ads and book viewings.'],
      ['Education and courses', 'Answer course, fee and schedule questions and send application links.'],
      ['Events', 'Ticket prices, dates and venue questions answered, with a checkout link to buy.']
    ],
    vs: [
      ['Page response time', 'Hours', 'Seconds'],
      ['Leads from Facebook ads', 'Answered when someone is free', 'Answered and qualified at once'],
      ['Order status questions', 'Agent looks it up', 'Answered from your data'],
      ['After-hours messages', 'Waiting till morning', 'Handled'],
      ['Follow-ups', 'Ad hoc', 'Within Meta’s window and tags'],
      ['Cost as you grow', 'More staff', 'Pay per conversation']
    ],
    faq: [
      ['What is a Messenger AI chatbot?', 'It is an AI agent that answers the messages your Facebook Page receives in Messenger. Replyvoo Closers answer questions, qualify leads and hand chats to your team.'],
      ['Do I need a Facebook Page?', 'Yes. Messenger automation works on a Facebook Page you admin, not on a personal profile.'],
      ['Can it message people who never contacted my Page?', 'No. Messenger is a reply channel. The Closer answers people who wrote to you, within Meta’s rules.'],
      ['Can I use the same Closer on Instagram?', 'Yes. Once both channels are live, one Closer can answer your Facebook Page and Instagram DMs with the same knowledge.'],
      ['Is it allowed by Meta?', 'Yes, when it uses the official Messenger Platform and follows the 24-hour window, message tag rules and the requirement to offer a human.']
    ],
    posts: ['instagram-dm-automation-guide', 'whatsapp-instagram-tiktok-coming-soon', 'pulse-inbox-human-takeover']
  }
];

const bySlug = slug => PAGES.find(p => p.slug === slug);
const byId = id => PAGES.find(p => p.id === id);

module.exports = { PAGES, UPDATED, bySlug, byId };
