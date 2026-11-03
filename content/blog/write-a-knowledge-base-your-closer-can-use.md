---
title: How to Write a Knowledge Base Your AI Closer Can Actually Use
description: A practical template for writing FAQs, prices, policies and handoff rules so your Replyvoo Closer gives accurate, confident answers to customers on Telegram.
category: Training
date: 2026-09-24
readTime: 8 min
cover: juno
keywords: chatbot knowledge base, ai faq template, train ai agent, customer support faq, replyvoo knowledge base, ai closer training
---

Here's the uncomfortable truth about AI agents: most bad answers aren't the AI's fault. They come from a knowledge base that is thin, vague, outdated or contradictory. Your Closer can only be as accurate as what you give it.

The good news is that writing a strong knowledge base is not hard. It's a few hours of focused work that pays back every single day. This guide gives you a structure, examples and a testing routine.

## How your Closer uses knowledge

When a customer sends a message, your Closer looks through the knowledge you've given it for the most relevant facts, then writes a reply in the personality you set. It doesn't browse your website live or check your stock system unless you've told it the information.

That means three things:

1. **If a fact isn't in the knowledge base, the Closer doesn't know it.**
2. **If a fact is vague, the answer will be vague.**
3. **If two facts contradict each other, the answer may be wrong.**

> Write your knowledge base like you're briefing a smart new hire who has never seen your business before.

## Where knowledge goes in Replyvoo

In **Agent Studio**, open your Closer and go to **Knowledge** (or step 3, **Teach it**, in the Training Coach). Knowledge is split into parts, because each kind of fact is used a little differently:

- **Q&A.** One customer question and your answer, plus other ways people ask it. These are matched most precisely. Paste many at once with "Q:" and "A:".
- **Products.** Name, exact price and currency, short description, buy link and an in-stock switch. Import a CSV with the columns `name, price, description, link`.
- **Policies.** Delivery, returns and refunds, payment methods, opening hours and contact, each with an example to start from.
- **Documents.** Import a page from your website (we read the text, skip menus and footers, and show you a preview first) or a `.txt`, `.md` or `.csv` file up to 200 KB.
- **Notes.** A free-text box for anything that doesn't fit the boxes above.

When a customer writes, your Closer gets **corrections** first (answers you fixed with "Fix this answer"), then the Q&As that match the question, then products and policies, then notes and documents.

![Agent Studio knowledge section with Q&As, products and policies](/img/screens/agent-studio.png)

For most businesses the fastest start is: your top 5 to 10 Q&As, every product with its price, and the three key policies (delivery, returns, payment). The Training Score in Agent Studio tracks exactly these.

## The structure that works

Use clear headings. Short sections. One fact per line where you can. Here is a template you can copy and fill.

```
## About us
- Business name, what we sell, who we serve
- Where we're based and where we deliver
- Opening hours and response times for human staff

## Products and prices
- Product name: price, size or variant, key benefit
- Bundles and current offers, with end dates

## Ordering and payment
- How to order
- Payment methods accepted
- When an order is confirmed

## Delivery
- Areas, fees and timeframes
- How tracking works

## Returns and refunds
- Conditions, timeframe, process

## Common questions
- Q: ... A: ...

## Tone and rules
- How we greet, how we sign off
- Words to use and avoid

## Hand off to a human when
- List of situations
```

Let's go through the parts that matter most.

## Products and prices: be exact

Imagine a hypothetical skincare store in a big city. A weak entry looks like this:

- "We have serums at good prices."

A strong entry looks like this:

- "Vitamin C Serum 30ml: $18. Brightens dull skin. Suitable for all skin types. Use in the morning before sunscreen."
- "Vitamin C Serum 50ml: $26."
- "Glow Bundle (Vitamin C Serum 30ml + Gentle Cleanser): $28. Saves $4. Offer ends 31 October."

Include the currency every time. Include sizes and variants. Include who the product is *not* for, if relevant. That's what stops the Closer from recommending the wrong thing.

## Delivery and payment: answer the follow-up too

Customers rarely ask one question. "Do you deliver to Nairobi?" is followed by "How much?" and "How long?" Put all three in one place:

- "Nairobi delivery: $6, 2 to 4 working days, via courier. Tracking number sent by message once shipped."

Do the same for payment:

- "We accept bank transfer, card via payment link and USDT. Pay on delivery is available in the city only, for orders under $70."

If **PayLink** is on, tell the Closer when to send a payment link: "Send a PayLink once the customer has confirmed the product and delivery address."

## Common questions: use real customer wording

Go through your last month of chats and copy the questions *exactly* as customers typed them. Slang, typos, pidgin, abbreviations. Then write your answer.

- Q: "how much 4 d serum" A: The Vitamin C Serum is $18 for 30ml.
- Q: "is it original?" A: Yes. We buy directly from the brand's authorised distributor and every product has a batch number you can verify.
- Q: "u deliver to mombasa?" A: Yes, we deliver to Mombasa. $6, 2 to 4 working days.

This helps the Closer recognise the question in the many ways people ask it.

## Tone and rules: say what you mean

Personality sliders set the overall feel. The **Rules** tab (step 4 in the coach) holds the rest: "Always do" and "Never do" lists, topics to avoid, a sign-off it always includes, your discount limit and your language. Write rules in plain words, for example:

- "Greet new customers with 'Hi! Welcome to Glow 😊'."
- "Call customers by their first name if they share it."
- "Never say 'cheap'. Say 'affordable' or 'great value'."
- "If someone asks whether they are talking to AI, say yes and offer to connect them to a person."
- "Never promise delivery on a specific date. Give the range."

## Handoff rules: protect the hard moments

Smart handoff is your safety net. In **Rules**, tick when it should fire:

- The customer is angry
- They ask for a refund, a cancellation or a withdrawal
- They ask for a human
- Legal, medical or money advice
- Orders over an amount you set
- Any keyword you add, like "wholesale"

When handoff triggers, the chat is flagged in **Pulse Inbox** so you or your team can step in. More on that in [Pulse Inbox and human takeover](/blog/pulse-inbox-human-takeover).

## What to leave out

- **Internal notes.** Supplier costs, margins, staff gossip.
- **Anything you don't want repeated.** Assume a customer could see any fact you add.
- **Long marketing copy.** It dilutes the facts. Keep the punchy lines in your ads.
- **Outdated offers.** Delete expired promos the day they end.

## Test it like a customer

The **Test chat** sits next to everything you edit in Agent Studio, and it uses your unsaved changes. Each reply shows which Q&A, product or policy it used.

1. Run the one-tap **scenario tests** in the Test lab: a price question, a delivery question, a refund (it should hand over), "Are you a bot?" (it should say it's an AI), a discount request (it should follow your limit) and something you haven't taught (it should say it will check with the team).
2. Ask every common question in at least two different phrasings.
3. Ask about something you *don't* sell. The Closer should say so politely, not invent it.
4. Add your own scenarios for the questions that matter most to your business.

If a reply is wrong, tap **Fix this answer**, write the right one and save. It becomes a correction, the highest-priority knowledge, and the next reply uses it.

## Keep it alive

A knowledge base is never finished. Agent Studio does the hard part of finding what's missing:

- The **Gaps** tab lists real customer questions your Closer handed over, said it would check, or a teammate had to answer, grouped with a count. Tap **Teach the answer** and it's covered next time.
- In **Pulse Inbox**, any AI reply has **Fix this answer**, so you can correct it while you read the chat.
- Read the **Night Shift Report** and ask **Juno** what customers asked this week.

![Juno answering a question about common customer questions this week](/img/screens/juno.png)

Fifteen minutes a week keeps your Closer sharp, and your Training Score high.

## Different Closers, different knowledge

If you run more than one Closer, give each one only what it needs. Ace (Sales Closer) needs products, prices and offers. Mira (Support Hero) needs order, delivery and returns detail. Bolt (Group Guardian) needs group rules. Focused knowledge produces more focused answers.

## Next steps

- [Start free on Replyvoo](/app) and paste in your first FAQ
- [Build your first Closer in Agent Studio](/blog/build-your-first-closer-agent-studio)
- [Learn how Pulse Inbox handoff works](/blog/pulse-inbox-human-takeover)
