# Pricing and business model

How Replyvoo makes money, what it costs to run, and how to change prices. All prices are in **USD**. Everything here can be changed in the admin panel without code.

> AI and payment-provider prices change. The cost numbers below are estimates from public price lists at the time of writing. **Check current Anthropic pricing** (https://www.anthropic.com/pricing) and your payment providers' fees before making decisions.

## 1. What customers pay for

Customers pay for **conversations**, not messages.

> **A conversation = one customer chat inside a 24-hour window, with up to 10 AI replies.**
> If the chat goes past 10 AI replies, or the customer comes back after 24 hours, a new conversation starts.

Most sales chats fit in one conversation. Human replies from Pulse Inbox are free. Both numbers (10 replies, 24 hours) are editable in **Admin → Billing rules**.

Each month the plan includes a number of conversations. When they run out, each extra conversation costs **1 Voo Credit** from the wallet. If there are no credits left, the Closer stops replying (the owner gets an email) until they top up or the period renews.

## 2. Plans (defaults from `scripts/seed.js`)

| Plan | Monthly | Yearly | Closers | Conversations / month | Team seats | Pro Brain chats | "Extra chat" price shown | Notes |
|---|---|---|---|---|---|---|---|---|
| **Spark** | $0 | $0 | 1 | 30 | 1 | 0 | – | Free plan, no card. New sign-ups start here. |
| **Starter** | $29 | $290 | 2 | 500 | 2 | 0 | $0.04 | Solo sellers and creators |
| **Growth** | $79 | $790 | 5 | 1,500 | 3 | 50 | $0.035 | Small teams, adds Blast + PayLink |
| **Pro** | $149 | $1,490 | 10 | 3,500 | 5 | 300 | $0.03 | "Most popular" anchor |
| **Business** | $299 | $2,990 | 25 | 6,000 | 12 | 1,000 | $0.025 | "Best value"; done-for-you setup + priority support (delivered manually) |
| **Titan** | $599 | $5,990 | 60 | 14,000 | 30 | 3,000 | $0.02 | Dedicated success manager |
| **Black** | $1,499 (from) | $14,990 | Unlimited (9999) | 40,000 | 999 | 10,000 | $0.018 | "Talk to sales" – not buyable online |

Pricing logic: the more AI a plan includes (conversations and Pro Brain chats), the more it costs. Pro ($149) is the anchor that makes Business ($299) the obvious upgrade for serious sellers.

Yearly = 10 × monthly (2 months free).

Plans are **prepaid periods**, not automatic card subscriptions: the customer pays for 1 month or 12 months; 3 days before the end they get a reminder email; if they don't renew, they drop to the free plan (nothing is deleted).

### Website chat gating

| Plan | Website chat sites | Hide "Powered by Replyvoo" | Custom CSS |
|---|---|---|---|
| Spark, Starter, Growth | 0 (locked) | – | – |
| Pro | 1 | – | – |
| Business | 3 | ✓ | ✓ |
| Titan | 10 | ✓ | ✓ |
| Black | every site (999) | ✓ | ✓ |

- **Website chat power-up**: $29 per site per 30 days, on any plan (adds to the plan's sites). Bought from the dashboard (Plan → Power-ups, Widget Studio, or the Channels card).
- Website conversations are billed exactly like Telegram: one conversation = one visitor chatting within 24 hours, up to the reply limit. The AI cost per conversation is the same, so margins match the channel-agnostic numbers below.
- Why this split: website chat is a strong upgrade reason from Growth ($79) to Pro ($149); agencies and multi-brand sellers move to Business for 3 sites and white-label. The free "Powered by Replyvoo" link (with the customer's Voo Squad referral code) is free marketing on every lower-plan widget.
- Change all of it in admin: plan fields *Website chat sites*, *Remove branding*, *Custom CSS*; the power-up price under Power-ups.

## 3. Voo Credits

Prepaid credits in the **Voo Wallet**. They don't expire.

**Credit packs**

| Pack | Credits | Bonus | Total | Price | Price per credit |
|---|---|---|---|---|---|
| Starter | 500 | 0 | 500 | $20 | $0.040 |
| Popular | 2,000 | 200 | 2,200 | $70 | $0.032 |
| Best value | 10,000 | 1,500 | 11,500 | $300 | $0.026 |
| Whale | 50,000 | 10,000 | 60,000 | $1,200 | $0.020 |

**What credits buy**

| Item | Cost |
|---|---|
| Extra conversation (after the plan's allowance) | 1 credit |
| Pro Brain conversation beyond the plan's Pro Brain chats | +1 credit (on top of the conversation) |
| Extra Closer slot for 30 days | 150 credits |
| Blast | 1 credit per 10 recipients |

**Power-ups** (bought with money): Extra Closer $5/month, Extra seat $5, Pro Brain (switch per Closer, uses plan allowance then +1 credit per chat), Done-for-you setup $99 once, Custom Voice (coming soon), WhatsApp channel (coming soon).

**Coupons**: `WELCOME20` (20% off the first paid plan), `VOO10` ($10 off any credit pack, 500 uses).

## 4. What it costs us to run

### AI cost per reply

Default model **Claude Haiku 4.5**: $1 per million input tokens, $5 per million output tokens (cache reads $0.10/M, but see the note below).

A typical Closer reply sends:
- system prompt (persona, rules, skills) ≈ 500–800 tokens
- knowledge snippets ≈ up to 1,500 tokens (max ~6,000 characters)
- recent chat history ≈ 300–800 tokens
- and receives ≈ 60–150 tokens

So one reply ≈ 1,500–3,000 input tokens + ~100 output tokens:

> **≈ $0.0015 – $0.003 per AI reply, call it ~$0.002.**

A conversation averages about 3–5 AI replies:

> **≈ $0.01 per average conversation.** Worst case (10 replies with a long knowledge base) ≈ $0.03.

Images (payment screenshots) add roughly $0.001–0.002 each.

Note on caching: the code marks the system prompt for prompt caching, but Anthropic only caches prompts above a minimum size (4,096 tokens on Haiku 4.5 at the time of writing), so today's short prompts are usually billed at the normal input price. The estimates above already assume no caching.

### Pro Brain
Pro Brain uses `AI_PRO_MODEL` (default `claude-sonnet-5-5`), a bigger model. At the time of writing that is about **2× the Haiku price per token** ($2/M input, $10/M output), so roughly **$0.005–0.006 per reply, ~$0.02–0.03 per conversation**. Check current Anthropic pricing; if you switch to an even larger model, costs go up accordingly.

### Other AI use (small)
Juno questions, the website chat bubble, AI Blast drafts and AI-written Nudges each cost about the same as one reply. Nudges are billed to the customer like a reply; the others are free for the customer.

### Voice notes
With transcription on (e.g. OpenAI Whisper at about $0.006 per audio minute – check current pricing), a 30-second voice note costs ≈ $0.003.

### Payment fees
Paystack and Flutterwave take roughly **1.5% to 4%** per transaction depending on local vs international cards and currency (check current fee pages). USDT has network fees paid by the sender.

### Infrastructure
One VPS ($10–40/month), email provider (free tiers cover the start, then ~$15–35/month), domain, backups storage. Small compared with AI cost once you have customers.

## 5. Gross margin per plan

Assumptions: the customer uses **all** included conversations at the **average** $0.01 each, plus all Pro Brain chats at an extra ~$0.015 each (Sonnet minus Haiku), and ~3% payment fees. Real customers usually use less than their allowance, so real margins are higher.

| Plan | Price | AI cost at full use | Payment fee | Gross margin |
|---|---|---|---|---|
| Spark | $0 | 30 × $0.01 = $0.30 | – | –$0.30 (marketing cost per free user) |
| Starter | $29 | $5.00 | $0.87 | ≈ $23.10 (80%) |
| Growth | $79 | $15.00 + $0.75 = $15.75 | $2.37 | ≈ $60.90 (77%) |
| Pro | $149 | $35.00 + $4.50 = $39.50 | $4.47 | ≈ $105 (70%) |
| Business | $299 | $60.00 + $15.00 = $75.00 | $8.97 | ≈ $215 (72%) – minus done-for-you setup time |
| Titan | $599 | $140.00 + $45.00 = $185.00 | $17.97 | ≈ $396 (66%) – minus success-manager time |
| Black | $1,499+ | $400.00 + $150.00 = $550.00 | $44.97 | ≈ $904 (60%) – custom deals, price above this |

Watch-outs:
- At the **worst case** ($0.03 per conversation: every chat uses 10 replies with a long knowledge base) the big plans lose money at full use. Watch real usage in the first months (count AI messages per conversation) and adjust conversation counts or prices if needed.
- Free users cost real money. If free sign-ups explode, lower Spark's 30 conversations or require email verification before connecting a bot.

### Credits margin
One credit = one conversation ≈ $0.01 average AI cost.

| Pack | Revenue per credit | Margin per credit used (avg) |
|---|---|---|
| Starter | $0.040 | ≈ 75% |
| Popular | $0.032 | ≈ 69% |
| Best value | $0.026 | ≈ 62% |
| Whale | $0.020 | ≈ 50% (still positive at worst-case usage) |

Pro Brain overage (1 credit for the conversation + 3 extra credits, `pro_brain_extra_credits`) and Blasts (Telegram sending is free) are high margin. Extra Closer slots cost nothing to run by themselves.

## 6. Why overage is charged in credits

- **No surprise bills.** Customers prepay. When credits run out, the Closer pauses; nobody gets an unexpected invoice.
- **No failed card charges.** Many customers in our markets pay by bank transfer, USSD, mobile money or crypto, which can't be charged automatically each month.
- **Cash up front.** You collect money before you spend it on AI.
- **One currency for extras.** Extra conversations, extra Closers, Pro Brain and Blasts all use the same wallet.
- **Optional Auto Top-up.** Customers who pay by Paystack card can switch on Auto Top-up to buy a pack automatically when they run low.

Note: each plan has an "Extra chat price" (e.g. $0.04 on Starter). It is only **display text** on the pricing cards. The real overage price is whatever a credit costs in the pack the customer bought ($0.020–$0.040). Keep the text roughly in line with your pack prices.

## 7. Voo Squad (referral) payout cost

- A referred friend gets **100 bonus credits** at sign-up (`referee_bonus_credits`).
- The referrer earns a share of **every** payment the friend makes, for as long as they pay: **20%**, rising to **25%** from 10 paying friends and **30%** from 50.
- The reward is paid in **credits**, valued at **$0.03 each** (`credit_value_usd`). Example: friend pays $149 → 20% = $29.80 → 993 credits.

Real cost: credits only cost you AI time when used (≈ $0.01 each), so a reward with a face value of 20% of revenue costs about **6–7% of that revenue** if fully used, less if not. The referee bonus costs ≈ $1 per referred sign-up if used. There is no cap or time limit in the code; set one in the referral terms (`content/legal/referral.md`) if you need one.

## 8. How to change everything from the admin

| To change… | Go to |
|---|---|
| Plan prices, limits, features, badges, offers with end dates, pause/add/reorder plans | **Admin → Plans** |
| Credit packs | **Admin → Credit packs** |
| Power-ups | **Admin → Power-ups** |
| Coupons | **Admin → Coupons** |
| What a conversation is (replies, window), free plan, credit value, credits for an extra Closer, Blast cost, Pro Brain extra credits, low-credit warning, sign-up and referee bonuses, referral tiers, currencies and exchange rates, USDT | **Admin → Billing rules** |
| Give a customer credits, a plan or a longer period | **Admin → Users & workspaces** |
| Switch Pro Brain, Blast, Nudge etc. on/off | **Admin → Channels & features** |

Changes apply immediately to the website, checkout and new conversations. Customers who already paid keep what they bought until their period ends.
