# Agent Studio: how training works

For the owner and the support team. Agent Studio (`/app/studio`) is where a customer builds and trains a Closer. This page explains what each part does, how the AI uses it, and how to help a customer get a high **Training Score**.

## The two ways in

**Training Coach** (default for new Closers and any Closer scoring under 70). Five steps with a progress rail. Each step has a short looping animation that shows *what happens*, and three plain-English tips:

| Step | What the customer does | What the animation shows |
|---|---|---|
| 1 · Pick a role | Chooses Sales, Support, VIP, Group Guardian, Booking or Win-back | A Closer trying on each job and saying a typical line |
| 2 · Personality | Name, avatar colour, tone / length / emoji sliders with a live sample reply. **Create & keep training** saves the Closer (paused) | Sliders moving from formal to friendly and the reply changing |
| 3 · Teach it | Q&As, products, policies, import | An FAQ card sliding into the "brain", then a customer asking that exact question and the Closer answering with the taught line highlighted |
| 4 · Set the rules | Do/don't lists, discounts, handoff triggers, language, pay link | An angry refund request lighting up a rule and the chat passing to a teammate |
| 5 · Test & launch | Score + checklist, one-tap tests, assign channels, **Go live** | The checklist ticking off, the score filling to 92 and the Live switch flipping |

The coach remembers the step per Closer (browser storage + saved on the server). **Switch to Pro view** is always one tap away.

**Watch a 30-second demo** (header button, any time): a sample shop names its Closer, sets the tone, adds "Do you deliver on Sundays?", a customer asks it and the reply streams in using that answer, a wrong answer gets fixed with **Fix this answer**, the next reply is right, and it goes live. Pause, replay and skip controls; captions; a still storyboard for people who prefer reduced motion. The same animation loops on the homepage (section "Agent Studio", switchable in Admin → Homepage → Sections).

**Pro view** has tabs: Personality · Knowledge (Q&A / Products / Policies / Documents / Notes) · Rules · Test lab · Gaps · Channels · History. The test chat is docked on the right on desktop and opens as a bottom sheet on phones.

## What saves when

- **Instantly:** knowledge items (add, edit, switch off, delete), gap teach/dismiss, custom scenarios, channel assignment, the Live switch.
- **Draft until Save:** name, role, personality, skills, extra instructions, rules, notes, pay link, Pro Brain. An "Unsaved" badge and a save bar appear. The draft is also kept in the browser, so closing the tab doesn't lose it.
- **History:** every Save stores a version (last 10). **Restore** brings back name, personality, skills, instructions, rules and pay link. Knowledge items are not part of versions.
- The test chat always uses the *current draft* plus the saved knowledge, so customers can try changes before saving.

## How the Closer uses knowledge

When a message arrives, the Closer gets a KNOWLEDGE block (max ~6,000 characters) built in this order:

1. **Corrections** that match the question ("Fix this answer"). Highest priority.
2. **Q&As** that match (question + "other ways people ask it").
3. **Products and prices**, and **policies** (all of them while the lists are small).
4. The other Q&As, then **notes** (free text), then matching **documents** (imported pages and files).

Matching is by words, not meaning: lowercase, common words removed, plurals and "-ing" endings folded, and shop synonyms grouped (price = cost = how much; deliver = ship = shipping; pay = payment = transfer; return = refund; discount = coupon = promo; open = hours…). That's why alternative phrasings on a Q&A help a lot.

The system prompt tells the AI to only state facts from KNOWLEDGE, never invent prices or discounts, and say it will check with the team (and hand over) when it doesn't know. Owner **rules** are added *after* Replyvoo's safety rules and can't override them (e.g. the Closer always admits it's an AI when sincerely asked).

Without an AI key (demo mode) replies are a rule-based preview: the best matching correction / Q&A / product / policy, the rules (handoff triggers, discount policy, sign-off), an honest "I'm an AI assistant" answer, and "I'll check with the team" for anything not taught.

## Knowledge types

| Type | Use it for | Tips |
|---|---|---|
| Q&A | The questions customers ask most | One question per Q&A. Answer like you'd type in chat. Add 2–3 other phrasings. **Paste many at once** with `Q:` / `A:` |
| Product | Everything you sell | Exact price + currency. Switch "In stock" off instead of deleting. **Import CSV**: `name, price, description, link` (optional `currency, stock, sku`) |
| Policy | Delivery, returns & refunds, payment methods, opening hours, contact | Each has an example. Delivery: areas, cost, time. Returns: window + process |
| Document | Your FAQ / shipping / pricing page, or a .txt/.md file | Preview first, untick menus and off-topic parts. Pages built only with JavaScript may import little text; paste the text instead |
| Notes | Anything else (story, sizing notes) | Used after everything above |
| Correction | Created by **Fix this answer** (Studio test chat or Pulse Inbox) | Shows what the AI said before. Edit or switch off any time |

## Rules

Always do · Never do · Topics to avoid · Always include (e.g. a sign-off) · Discounts (only from knowledge / never / up to X%) · Hand over when: angry, refund/cancel, asks for a human, legal/medical/money advice, orders over an amount, keywords · Working-hours note · Language (customer's language, or always one language).

## Test lab, gaps and the score

**Scenario tests** (one tap each, or **Run all**):

| Test | Pass when |
|---|---|
| "What's your price?" | The reply contains a price |
| "Do you deliver to London?" | It answers (no handoff, no "I'll check") |
| "I want a refund!" | It hands over to a human |
| "Are you a bot?" | It says it's an AI assistant |
| "Can I get a discount?" | It follows the discount rule |
| "Can you engrave a name on it?" | It says it will check / hands over instead of inventing |

Customers can add their own scenarios with an expectation. Checks are simple heuristics: always read the reply too.

**Gaps** lists real customer questions (last 90 days) where the Closer handed over, said it would check, or a teammate replied. Similar wording is grouped with a count. Refund / "talk to a human" / angry messages are skipped (those handoffs are intended). **Teach the answer** creates a Q&A and closes the gap; **Dismiss** hides it. A badge shows open gaps in the Studio header and on **My Closers**.

**Training Score (0–100)**, computed on the server and shown on every Closer card:

| Item | Points |
|---|---|
| Personality set (coach step 2 done, sliders moved, colour picked or instructions written) | 10 |
| At least 5 Q&As (partial credit) | 20 |
| Products or prices (a product, or a price in a Q&A or the notes) | 15 |
| Delivery, returns and payment policies (5 each) | 15 |
| Payment link (only required for Sales, VIP and Win-back roles) | 10 |
| Rules set | 10 |
| 3 scenario tests run (partial credit) | 10 |
| No open gaps | 10 |

Every checklist item is a link to the right place.

## Helping a customer get a high score (support playbook)

1. Ask them to press **Watch a 30-second demo** first. Most "how do I…" questions disappear.
2. Open **Guide me / Coach**, step 3. Get 5 Q&As in: tap the suggested questions ("How much is it?", "How do I pay?"…) and write their real answers.
3. Products: if they have a spreadsheet, export CSV and use **Import CSV**. Otherwise add the top 3 sellers by hand with exact prices.
4. Policies: fill delivery, returns, payment (start from the examples and edit).
5. Rules: pick at least one "Never do" (e.g. "Promise exact delivery dates") and a discount setting. Keep refund and angry handoffs on.
6. Step 5: **Run all** tests. For anything marked "Needs attention", read the reply and either teach a Q&A or **Fix this answer**.
7. After going live: check **Gaps** weekly and teach the top questions; use **Fix this answer** in Pulse Inbox while reading chats.

A Closer with 10 Q&As, all products, three policies, rules and passing tests typically scores 90+.

## Common questions from customers

- **"It gave a wrong answer."** Tap **Fix this answer** on that reply. It's saved as a correction and used from the next message.
- **"It said it will check with the team."** It didn't find the fact. Teach it (Gaps tab), or add another phrasing to the Q&A.
- **"Import from website failed."** The page must be public on http/https; private network addresses and unusual ports are blocked for security. Try the exact FAQ page, or paste the text with **Paste text**.
- **"My changes don't show in Telegram."** Personality, rules and notes need **Save**. Knowledge saves instantly.
- **"Can I undo?"** History → **Restore**.

For the technical details see [ARCHITECTURE.md §6](ARCHITECTURE.md#6-ai-engine-flow) and the endpoints in [API.md](API.md#agent-studio-training-srcroutesstudiojs).

## Voice guide and "talk to train"

- **Voice guide.** Every coach step and the 30-second demo are narrated by a warm, energetic female voice, with captions on screen. A "Voice guide on/off" button sits on each coach step and in the demo controls; the choice is remembered per browser. Sound only starts after the user clicks something, as browsers require.
- **Where the voice comes from.** The lines live in `public/audio/narration/lines.json`. Run `ELEVENLABS_API_KEY=... npm run make-voice` once (on any machine with internet) to record them as MP3s with the ElevenLabs voice "Alessandra Grey – Bright, Warm & Real" (`ELEVENLABS_VOICE_ID` to change it). The script writes `public/audio/narration/<id>.mp3` and marks them in `lines.json`; commit those files. Until then the browser's built-in voice reads the lines, so nothing breaks.
- **Changing the words.** Edit `lines.json`, then run `npm run make-voice -- --only=s3` (or `--force` for all).
- **Talk to train.** Every Q&A, instructions and fix-an-answer field has a mic button. Chrome, Edge and Android use the browser's free speech typing. Other browsers record a short clip and send it to `POST /api/app/transcribe`, which uses `TRANSCRIBE_API_KEY` (Whisper-compatible). Without that key those browsers show a friendly message.
- **Demo video.** `public/video/replyvoo-studio-demo.mp4` (about 40 s, 1280×720, silent with on-screen captions) plays from the homepage's Agent Studio section ("Watch the video"). Re-record it after design changes by playing `RVTrain.demo()` in a 1280×720 browser window and screen-recording it.
