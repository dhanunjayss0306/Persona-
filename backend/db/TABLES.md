# Database — what each table is for

Run order (Supabase → SQL Editor): `schema.sql` first, then each file in `migrations/` in number order.

| Table | What it stores | Key columns |
|---|---|---|
| `users` | Accounts — email/phone + password, or Google login | `email`, `phone`, `password_hash`, `google_id`, `onboarding` (json) |
| `devices` | Push-notification tokens, one row per device | `user_id`, `fcm_token` |
| `contacts` | Phone contacts for "call X" voice action | `user_id`, `name`, `phone` |
| `reminders` | One-time + strict (nag) reminders | `title`, `type` (once/nag), `due_at`, `status` |
| `proofs` | Photo/voice/text proof that stops a strict reminder | `reminder_id`, `kind`, `file_url`, `text` |
| `plans` | 2–3 month study plans | `title`, `start_date`, `end_date`, `hours_per_day`, `topics` |
| `plan_days` | Day-by-day blocks inside a plan | `plan_id`, `day`, `blocks` (json), `done` |
| `fixed_events` | Exams with fixed dates (planner works around them) | `title`, `event_date` |
| `journal_entries` | Diary pages | `title`, `body`, `mood`, `entry_date`, `share_token` |
| `expenses` | UPI expense log | `amount`, `paid_to`, `upi_app`, `category`, `spent_at` |
| `cart_items` | Tracked products + target prices | `name`, `url`, `shop`, `target_price`, `last_price` |
| `price_history` | Every price check, for the sparkline | `cart_item_id`, `price`, `checked_at` |
| `playlists` | Spotify playlists the app created | `name`, `spotify_id`, `songs` (json) |
| `groups` | Task groups | `name`, `created_by` |
| `group_members` | Who belongs to which group | `group_id`, `user_id` |
| `group_tasks` | Tasks assigned inside groups | `group_id`, `title`, `assignee`, `status`, `due_at` |

Every table has `id` (uuid) and `created_at`. User tables link with `user_id`
and delete with the user (`on delete cascade`).
