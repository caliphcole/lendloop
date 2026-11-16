# LendLoop

LendLoop is a neighborhood tool board. Public visitors see tool names and categories. Signed-in users list tools, request dates, manage incoming requests, and mark loans returned. The browser-only preview is in the adjacent lendloop folder.

## Run the integrated app

1. Run `npm ci` in this folder on Node.js 22 or later.
2. In Clerk, create a development application and activate the Convex integration. Copy `.env.example` to `.env.local` and enter the Clerk publishable and secret keys locally.
3. Run `npx convex dev` and select a development project. The CLI populates `NEXT_PUBLIC_CONVEX_URL`. In the Convex deployment settings, set `CLERK_JWT_ISSUER_DOMAIN` to the Clerk frontend API URL. Optionally set `LENDLOOP_ADMIN_SUBJECTS` to a comma-separated list of Clerk user IDs. Re-run the Convex sync if it initially reported that the issuer was missing.
4. In another terminal, run `npm run dev`. Open the address it prints. Sign in with two separate development users in separate browser profiles to create and approve a loan.

## Connect n8n

The workflows are configured to record mock notifications in Convex. Their runs show whether a notification was recorded or previously handled.

1. Set `LENDLOOP_CONVEX_SITE_URL` to the deployment's HTTPS `.convex.site` origin and generate a random secret with `openssl rand -hex 32`. Set the same `LENDLOOP_WEBHOOK_SECRET` in Convex and in the environment used by Docker Compose. Keep both values local or in service secret settings.
2. Run `docker compose up -d` and open `http://localhost:5678`. Import both JSON files in `workflows/`. Publish the request and reminder workflows. The reminder runs daily at 09:00 UTC.
3. Copy the request workflow's production webhook URL into Convex as `N8N_REQUEST_WEBHOOK_URL`. When using Convex Cloud, the URL must be reachable from the cloud deployment. Use an HTTPS ingress for the webhook route or a privately administered n8n deployment with a reachable HTTPS endpoint. Keep the n8n editor private. Set `WEBHOOK_URL` to the externally reachable origin if using Docker behind an HTTPS ingress.
4. Create a borrow request and inspect the n8n execution and Convex event. To exercise reminders in a development deployment, use an approved loan whose end date has passed and run the reminder workflow manually. Repeat the run to verify that an existing receipt does not produce another notification.

## Data and access

Clerk identifies the user. Convex checks owner, participant, and admin permissions on the server. It also checks overlapping approved dates inside the same mutation that approves a request. Anonymous responses omit names of owners and all contact information. The workflow notification includes a tool name, status, and event ID. Reminder responses contain a loan ID, tool name, and due date. No email addresses or phone numbers are sent to n8n.

Request events are written alongside the loan change and retried by a Convex cron when a receipt is missing. The n8n webhook verifies an HMAC over the notification payload. Convex verifies signed, time-limited n8n calls and records mock deliveries atomically, so duplicate workflow calls result in one stored receipt. Failed calls appear in n8n execution history and Convex logs.

For production, use separate secrets for each direction, scope admin access through managed roles, restrict webhook ingress, apply rate limits and retention, and alert on old undelivered events. For real notifications, use a provider that accepts an idempotency key, store its receipt, and look up recipient contact data only at the delivery boundary.
