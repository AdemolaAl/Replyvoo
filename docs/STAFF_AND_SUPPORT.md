# Staff, access and the support desk

Replyvoo's admin is shared by your whole team. Each person gets a **role**, can be fine-tuned **page by page**, and works only the **support boxes** you give them.

## Roles

| Role | Default access |
| --- | --- |
| Owner | Everything, including other owners. At least one owner always remains. |
| Admin | Everything except changing or removing owners |
| Support | Support desk (edit), Overview, Users and Orders (view) |
| Finance | Orders, plans, packs, coupons and billing rules (edit), desk and users (view) |
| Content | Homepage, channels, company and SEO, blog, legal pages and emails (edit) |
| Viewer | Everything read-only, except Staff |

Every page group can be overridden per person: **No access**, **View** or **Edit**. The server checks access on every `/api/admin/*` call. Hiding a menu item is cosmetic; the server's 403 is what blocks access. Pages a person can only view open in read-only mode with a small "View only" note.

Code: `src/services/staff.js` (roles, sections, the guard), `src/routes/staff.js` (staff, invites, boxes, join, 2-step code), `public/js/admin/team.js` (Staff & access page).

## Inviting staff and how they log in

1. Admin → **Staff & access → Invite staff**: email, role, optional job title, page overrides and boxes.
2. They get an email with a join link (valid 7 days, can be resent or cancelled).
3. **VooSquare on:** they press *Continue with VooSquare*, log in or sign up with the invited email, and come back to join. **VooSquare off:** they choose a name and password (10+ characters), or enter their existing Replyvoo password.
4. **2-step code:** in production every staff session needs a 6-digit code sent by email (10 minutes, 5 tries, then a new code). Turn it off with `STAFF_2FA=false` (not recommended).
5. Pausing a person logs them out immediately and keeps their settings. Removing them sends their open tickets back to unassigned.

Staff can also be managed from **VooSquare HQ** (`POST /api/voosquare/staff`). They show a VooSquare badge on the Staff page. Owners are only ever set inside Replyvoo.

Owners keep a password login as a backup if VooSquare is down. Other staff log in through VooSquare when it's on. To reset a password from the server, run `npm run create-admin -- email "password" "Name"`.

## Support desk

Admin → **Support desk**: boxes on the left, tickets in the middle, the conversation on the right (on phones, the conversation replaces the list).

**Where tickets come from**

| Source | How |
| --- | --- |
| Website chat | Visitor taps "Talk to a human" and leaves their email |
| Contact and sales forms | `/contact` (sales enquiries get high priority) |
| Dashboard help | Logged-in customers press **Help** in the top bar |
| Telegram | Customers message your support bot (`SUPPORT_TG_BOT_TOKEN`, then Admin → Support desk → settings → Connect) |
| Email | Inbound webhook `/webhooks/support-email?key=SUPPORT_INBOUND_KEY` (Postmark, Resend, Mailgun, SendGrid or any JSON with from, subject and text) |

**Routing:** each source goes to a box (desk settings). With auto-assign on, a new ticket goes to the least busy teammate who works that box and can reply (support agents first, then admins). The assignee gets an email.

**Replying:** replies go back the way the customer came in: Telegram via the support bot, email for website, contact, sales and email tickets, and the customer's dashboard Help panel for dashboard tickets. Subjects carry the ticket number (`[T-1A2B3C]`), so email replies thread back into the same ticket. Internal notes are never sent. A failed delivery is kept and marked "not delivered".

**Tools in the composer:**

- Saved replies, with `{{name}}` filled in
- AI draft, written from your live pricing and help facts (review before sending)
- Send & solve
- Ctrl+Enter to send

Status (Open, Waiting on customer, Solved), priority (Normal, High, Urgent), box and assignee can all be changed from the ticket header. A customer reply reopens a solved ticket.

**Customer context:** with Users access, the agent sees the customer's workspace, plan, total paid, channels and earlier tickets.

**Live:** the desk refreshes every 8 seconds, and the menu badge shows unread tickets.

Code: `src/services/support.js`, `src/routes/support.js`, `public/js/admin/desk.js`, `public/js/app/help.js`.

## Data

Migration `007_staff_support.sql` adds these tables:

- `staff`, `staff_invites`
- `sessions.mfa_at`
- `support_boxes`, `support_tickets`, `support_messages`, `support_saved_replies`

Everyone who was an admin before the migration becomes an Owner.

## Tests

`test/staff-support.test.js` covers:

- Roles and page overrides, owner protection, pausing access
- The 2-step code
- Every intake channel, box scoping, replies by channel, reopening
- Assignment and the AI draft
- Telegram and email webhooks
- The VooSquare HQ endpoints
- Customer team invites
