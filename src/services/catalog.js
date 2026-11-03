'use strict';
// Static product content shared by the website, dashboard and AI prompts.

const TEMPLATES = [
  { id: 'sales', name: 'Ace', role: 'Sales Closer', color: '#FFC21A', letter: 'A', desc: 'Answers prices, handles objections, upsells bundles and sends the payment link.', skills: ['Payment links', 'Upsells', 'Objections'],
    brief: 'Your job is to turn questions into paid orders. Answer prices and availability clearly, handle objections calmly, suggest a relevant bundle or add-on when it truly helps, and guide the customer to pay.' },
  { id: 'support', name: 'Mira', role: 'Support Hero', color: '#8FB8FF', letter: 'M', desc: 'Tracks orders, fixes problems and calms angry customers before they leave.', skills: ['Order help', 'Refund rules', 'Calm tone'],
    brief: 'Your job is to solve problems fast. Be warm, apologise once when something went wrong, give clear next steps, and hand the chat to a human for refunds, complaints you cannot resolve, or anything sensitive.' },
  { id: 'vip', name: 'Royal', role: 'VIP Concierge', color: '#C9A7FF', letter: 'R', desc: 'Gives your best customers white-glove service and early access to offers.', skills: ['VIP perks', 'Priority handoff', 'Personal touch'],
    brief: 'Your job is to make top customers feel valued. Be polished and personal, mention VIP perks from the knowledge base, and hand over to a human quickly for big orders.' },
  { id: 'guard', name: 'Bolt', role: 'Group Guardian', color: '#7EE0B0', letter: 'B', desc: 'Welcomes members, answers FAQs in groups and wipes spam and scam links.', skills: ['Welcome', 'Anti-spam', 'Group FAQ'],
    brief: 'You live in a Telegram group. Welcome new members briefly, answer questions when you are mentioned, keep replies very short, and never argue.' },
  { id: 'book', name: 'Tempo', role: 'Booking Pro', color: '#FFB199', letter: 'T', desc: 'Books calls, viewings and appointments and sends reminders.', skills: ['Bookings', 'Reminders', 'Reschedule'],
    brief: 'Your job is to book appointments. Collect the service, preferred day and time, and contact details, offer available slots from the knowledge base, and confirm clearly.' },
  { id: 'win', name: 'Echo', role: 'Win-back Hunter', color: '#FFE07A', letter: 'E', desc: 'Brings back leads who went quiet with the right nudge.', skills: ['Nudge', 'Offers', 'Re-engage'],
    brief: 'Your job is to re-engage people who went quiet. Be friendly and low-pressure, remind them what they were interested in, and offer one clear next step.' }
];

const SKILLS = [
  ['paylink', 'PayLink', 'Share your payment link when the customer is ready to buy'],
  ['vision', 'Voice & Vision', 'Understand voice notes and screenshots'],
  ['upsell', 'Upsells', 'Suggest bundles and add-ons when they genuinely help'],
  ['nudge', 'Nudge', 'Follow up once when a lead goes quiet (inside Telegram’s rules)'],
  ['handoff', 'Smart handoff', 'Pass angry, sensitive or big-money chats to your team'],
  ['receipt', 'Receipt check', 'Read payment screenshots and flag them for confirmation']
];

const FEATURES = [
  ['s4', 'Pulse Inbox', 'Every bot, account and group in one live inbox.', 'Your team sees who’s waiting, who’s hot and which Closer is on it. Take over any chat in one tap.', 'inbox', 'dark'],
  ['s2', 'HeatScore', 'Hot, warm or cold. Automatically.', '', 'fire', 'heat'],
  ['s2', 'Voice & Vision', 'Hears voice notes. Reads screenshots.', '', 'mic', 'wave'],
  ['s2', 'Polyglot', 'Replies in your customer’s language, from French and Swahili to Arabic.', '', 'globe', ''],
  ['s2', 'Nudge', 'Follow-ups that bring quiet leads back on time.', '', 'clock', ''],
  ['s3', 'Blast', 'Broadcast to the right segment, like everyone who chatted but never paid.', '', 'send', ''],
  ['s3', 'PayLink', 'Share your payment links and check receipts inside the chat.', '', 'card', ''],
  ['s2', 'Shield', 'Guards your groups from spam and scam links.', '', 'shield', ''],
  ['s2', 'Night Shift Report', 'Your day in one email or Telegram message, every evening.', '', 'moon', ''],
  ['s2', 'Joinvoo Sync', 'Pairs with Joinvoo to send real sales back to your ad platforms.', '', 'link', '']
];

const VS_ROWS = [
  ['Reply time', 'Minutes to hours', 'Seconds'],
  ['Working hours', '9 to 5, if lucky', '24/7, every day'],
  ['Languages', 'The ones you hired', 'Your customer’s language'],
  ['Same question, 100 times', 'Gets tired and short', 'Same energy every time'],
  ['Follow-ups', 'Forgotten', 'Nudge sends them on time'],
  ['Scaling to 10,000 chats', 'Hire, train, manage', 'Add a Closer in minutes'],
  ['Monthly cost', 'A salary per person', 'From $0']
];

const CHANNELS = [
  { id: 'telegram', name: 'Telegram', flag: 'telegram_bot', icon: 'plane', color: '#2AABEE', desc: 'Bots, groups and personal accounts through Telegram Business.' },
  { id: 'website', name: 'Website chat', flag: 'website', icon: 'globe', color: '#FFC21A', desc: 'An AI chat bubble on your own website. Your colours, your logo, one line of code.' },
  { id: 'whatsapp', name: 'WhatsApp', flag: 'whatsapp', icon: 'phone', color: '#25D366', desc: 'Official WhatsApp Business Platform. Support, sales and order updates.' },
  { id: 'instagram', name: 'Instagram', flag: 'instagram', icon: 'camera', color: '#E1306C', desc: 'DMs, story replies and comment-to-DM for professional accounts.' },
  { id: 'tiktok', name: 'TikTok', flag: 'tiktok', icon: 'note', color: '#121110', desc: 'Business messaging for DMs and leads from TikTok ads.' },
  { id: 'messenger', name: 'Messenger', flag: 'messenger', icon: 'bolt', color: '#6D5BFF', desc: 'Facebook Page messages answered by your Closers.' }
];

module.exports = { TEMPLATES, SKILLS, FEATURES, VS_ROWS, CHANNELS, template: id => TEMPLATES.find(t => t.id === id) || TEMPLATES[0] };
