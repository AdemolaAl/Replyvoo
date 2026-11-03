---
title: Security and Vulnerability Reporting
description: How Replyvoo protects accounts, bot tokens and conversations, what you can do to stay safe, and how to report a security issue.
updated: 2026-11-02
---

# Security and Vulnerability Reporting

This page explains how we protect Replyvoo and your data, what you can do to keep your account safe, and how to tell us about a security problem. It forms part of our [Terms of Service](/legal/terms). The technical measures we commit to as a data processor are listed in our [Data Processing Addendum](/legal/dpa).

## 1. How we protect Replyvoo

- **Encryption in transit.** Replyvoo is served only over HTTPS, with HTTP Strict Transport Security.
- **Encryption of secrets.** Telegram bot tokens, payment keys and other secrets you or we store are encrypted in the database with AES-256-GCM. They are never shown again after they are saved.
- **Passwords.** Passwords are stored only as salted scrypt hashes. We cannot see them and will never ask for them.
- **Sessions.** Login sessions use secure, HttpOnly cookies, and changing your password logs out your other devices.
- **Staff access.** Our team works in a separate admin area with role-based access: each person sees only the pages their job needs. Staff log in with a 6-digit code sent by email on top of their password, and admin actions are logged.
- **Signed webhooks.** Messages from Telegram and payment confirmations from our payment processors are checked with secret tokens or signatures, and payments are confirmed with the processor directly before anything is activated.
- **Abuse protection.** Login, sign-up and other sensitive actions are rate-limited, and requests from other websites are blocked from changing your account.
- **Backups.** The database is backed up regularly; backups are kept for 14 days and then overwritten.
- **Least data.** Events we share with VooSquare (the shared Zedapex account) never include your customers' names, contact details or messages.

No system is perfectly secure, but we work to keep risks low and to fix problems fast.

## 2. What you can do

- Use a long, unique password, or log in with your Voo ID, and keep your email account secure: it can reset your password.
- Invite teammates with their own logins and the lowest role they need. Remove people who leave.
- Keep your Telegram bot token private. If you think it leaked, revoke it in @BotFather (/revoke) and connect the new token in Replyvoo.
- Never paste passwords, one-time codes or card numbers into a chat, and do not train your AI Closer to ask customers for them.
- Check payment confirmations in your bank or payment provider, not only in screenshots.
- Tell us straight away at security@replyvoo.com if you see activity you don't recognise.

**We will never ask for your password or a login code** by email, chat or phone. Messages that do are not from us.

## 3. Reporting a vulnerability

If you believe you have found a security vulnerability in Replyvoo, please email **security@replyvoo.com** with:

- a description of the issue and where it is (page, address or API);
- the steps to reproduce it, and what an attacker could do with it;
- any proof of concept, screenshots or logs; and
- how we can contact you.

Please write in English if you can. If the report contains sensitive details, say so and we will arrange a safer way to send them.

## 4. Rules for security research

We will not take legal action against, or ask anyone to take action against, people who research and report in good faith and within these rules:

- Test only against your own account and workspace, or accounts you have permission to use. Never access, change or delete other people's data. If you reach data that isn't yours, stop, do not keep it, and tell us.
- Do not run tests that harm the Service or other users: no denial of service, load or spam testing, no social engineering of our staff or customers, and no physical attacks.
- Do not send messages through our customers' bots or to their customers.
- Give us reasonable time to fix the issue before you tell anyone else, normally 90 days, or sooner if we agree.
- Do not ask for payment as a condition of telling us.

Out of scope: reports from automated scanners without a working example, missing best-practice headers with no real impact, self-XSS, clickjacking on pages with no sensitive actions, and issues in third-party services (such as Telegram or a payment processor) that we do not control; please report those to the provider.

## 5. What happens next

- We confirm we received your report within 3 business days.
- We investigate, keep you updated, and tell you when the issue is fixed.
- With your permission, we thank you by name once the fix is out.

## 6. If there is a breach

If we discover a breach of security that affects your personal data or your customers' data, we will tell you without undue delay, explain what happened and what we are doing about it, and help you meet any duty you have to notify others, as set out in our [Data Processing Addendum](/legal/dpa) and [Privacy Policy](/legal/privacy).

## 7. Contact

Zedapex Limited, Lagos

- Security: security@replyvoo.com
- Support: support@replyvoo.com
