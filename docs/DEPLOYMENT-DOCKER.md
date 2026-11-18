# Deploying CaratFlow to your own server


This guide takes you from an empty Linux server to CaratFlow running on your own domain
over HTTPS, updated automatically from GitHub. No Docker knowledge is required; just
follow the steps in order. (`docs/deployment.md` is the older, developer-oriented guide.)

```
GitHub (push to main) -> CI passes -> "Deploy" workflow
   builds 6 Docker images -> pushes to GHCR -> SSH to your server
   -> pulls images -> applies DB schema -> restarts -> health check (rollback on failure)
```

What runs on the server (all in Docker, only ports 80/443 are open):

| Address | What |
| --- | --- |
| `https://app.YOURDOMAIN/admin` | Admin / ERP application |
| `https://shop.YOURDOMAIN` | Customer storefront |
| `https://YOURDOMAIN` and `www.` | Marketing website |
| `https://api.YOURDOMAIN` | API (`/health`, `/api/v1`, tRPC, websockets) |
| `https://files.YOURDOMAIN` | File storage (MinIO S3 API; used for upload/download links) |

Plus MySQL 8, Redis 7 and MinIO, which are private (not reachable from the internet).

> **MinIO is built from source.** MinIO no longer publishes its community images on Docker
> Hub or Quay, so `docker/minio.Dockerfile` and `docker/mc.Dockerfile` compile the pinned
> releases (see `MINIO_TAG` / `MC_TAG`, each also pinned by commit) and the workflow pushes
> them as `caratflow-minio` and `caratflow-mc` next to the app images. MinIO and mc are
> AGPL-3.0 software; they are unmodified and only used over the network. There is no
> behavioural change for the app. The first build compiles MinIO (about 5-10 minutes);
> later builds reuse the GitHub Actions cache. Redeploying an image tag built before this
> change (rollback/`image_tag`) will fail to pull `caratflow-minio`/`caratflow-mc`.

## 1. What to rent / prepare

- A Linux VPS running **Ubuntu 22.04 or 24.04**: minimum **2 vCPU, 4 GB RAM, 40 GB disk**
  (more disk if you store many photos). Any provider works (Hetzner, DigitalOcean,
  AWS Lightsail, ...).
- A **domain name** you control and access to its DNS settings.
- A **GitHub repository** containing this code (your fork), with Actions enabled.
- An email address for certificate notices.

## 2. DNS records

Create these `A` records, all pointing to your server's public IPv4 address
(replace `example.com` with your domain):

| Name | Type | Value |
| --- | --- | --- |
| `example.com` (`@`) | A | server IP |
| `www` | A | server IP |
| `app` | A | server IP |
| `shop` | A | server IP |
| `api` | A | server IP |
| `files` | A | server IP |

Wait until they resolve (`nslookup app.example.com`). HTTPS certificates are issued
automatically on first start; this fails if DNS is not ready.

## 3. Prepare the server

Log in as root (or a sudo user) and run the setup script. It installs Docker, creates a
`deploy` user, opens only ports 22/80/443 in the firewall, enables automatic security
updates and installs the daily backup job. It is safe to run again.

First create the deploy SSH key **on your own computer** (step 5a below), then on the server:

```bash
curl -fsSL https://raw.githubusercontent.com/YOUR_GITHUB_USER/YOUR_REPO/main/deploy/server-setup.sh -o server-setup.sh
sudo DEPLOY_PUBKEY="ssh-ed25519 AAAA... caratflow-deploy" bash server-setup.sh
```

If your repository is private, copy `deploy/server-setup.sh` to the server with `scp`
instead of using `curl`.

## 4. Create the server configuration (`.env`)

On the server, as the `deploy` user (`sudo -iu deploy`):

```bash
cd /opt/caratflow
# copy deploy/.env.production.example from the repo to /opt/caratflow/.env, e.g. from your
# computer:  scp deploy/.env.production.example deploy@SERVER:/opt/caratflow/.env
chmod 600 .env
nano .env
```

Fill in every `CHANGE-ME` value. Generate strong secrets with:

```bash
openssl rand -base64 48                                    # JWT_SECRET
openssl rand -base64 36 | tr -d '/+=' | cut -c1-32         # database / redis passwords
openssl rand -hex 32                                       # webhook secrets
openssl rand -hex 16                                       # MINIO_ROOT_USER
```

Set `DOMAIN`, `ACME_EMAIL` and `GHCR_OWNER` (your GitHub user or organisation, lowercase).
Leave `IMAGE_TAG=latest`; the deploy workflow updates it. Payment, SMS and WhatsApp keys
are optional: leave them commented out and add them later (section 12).

Keep a copy of `.env` somewhere safe (a password manager). It is **not** in GitHub and
**not** in the backups.

## 5. SSH deploy key and GitHub secrets

### 5a. Create the key (on your computer, not the server)

```bash
ssh-keygen -t ed25519 -f caratflow_deploy -C "caratflow-deploy" -N ""
```

This makes `caratflow_deploy` (private) and `caratflow_deploy.pub` (public).

- Put the **public** key on the server: pass its content as `DEPLOY_PUBKEY` in step 3, or
  append it to `/home/deploy/.ssh/authorized_keys`.
- Test: `ssh -i caratflow_deploy deploy@SERVER_IP` should log in without a password.
- Optional but recommended, get the server's host key fingerprints for GitHub:
  `ssh-keyscan -p 22 SERVER_IP` (paste the output into the `SSH_KNOWN_HOSTS` secret).

### 5b. GitHub secrets

Repository, Settings, Secrets and variables, Actions, **Secrets** tab. (You may store
them as *Environment* secrets in the `production` environment instead; the workflow
works with both. Using the environment lets you require a manual approval before deploys.)

| Secret | Required | Value |
| --- | --- | --- |
| `SSH_HOST` | yes | server IP or hostname |
| `SSH_USER` | yes | `deploy` |
| `SSH_PRIVATE_KEY` | yes | full content of the private key file `caratflow_deploy` |
| `SSH_PORT` | no | only if SSH is not on port 22 |
| `SSH_KNOWN_HOSTS` | recommended | output of `ssh-keyscan` (without it the first connection is trusted blindly) |
| `GHCR_PULL_TOKEN` | no | a GitHub personal access token with only `read:packages`. Without it the workflow's own short-lived token is used to pull the images, which works for packages created by this repository. The server logs out of GHCR after every deploy either way. |

### 5c. GitHub variables (Variables tab)

These are **build-time** values: they are baked into the web, storefront and website
images, which is why they are repository variables and not part of the server `.env`.

| Variable | Required | Value |
| --- | --- | --- |
| `DEPLOY_ENABLED` | yes | `true` (the workflow does nothing until this is set) |
| `DOMAIN` | yes | `example.com` (same as in the server `.env`) |
| `TENANT_ID` | yes | a UUID you generate for your tenant (see step 8; run `uuidgen`) |
| `TENANT_SLUG` | yes | your tenant slug, e.g. `my-jewellers` |
| `NEXT_PUBLIC_IMAGE_HOSTS` | no | extra image hostnames for the storefront, comma separated |

Derived automatically: `NEXT_PUBLIC_API_URL=https://api.DOMAIN`,
`NEXT_PUBLIC_SITE_URL=https://DOMAIN`.

> Changing `DOMAIN`, `TENANT_ID` or `TENANT_SLUG` later needs a new deploy (the images
> are rebuilt with the new values).

## 6. Package visibility (one-time)

After the first workflow run, images appear under your GitHub profile, Packages
(`caratflow-api`, `-web`, `-storefront`, `-website`). They are private by default, which
is what you want. If a pull fails with "denied", open each package, Package settings,
and make sure this repository has access (Manage Actions access / "Connect repository"), or
set `GHCR_PULL_TOKEN`.

## 7. First deploy

GitHub, **Actions**, **Deploy**, **Run workflow**:

- branch: `main`
- `run_seed`: tick **only if you want the demo data** (a fictional jeweller with sample
  products and the demo logins). Do **not** tick it for a real installation: use step 8.

The workflow builds the images (first build 10-15 minutes, later ones are faster), copies
the compose files to `/opt/caratflow`, applies the database schema, starts everything and
waits until `https://api.DOMAIN/health` answers. If it fails it rolls back to the
previous version (on the very first deploy there is nothing to roll back to; read the
log, fix the cause, run again).

After this, every push to `main` whose CI passes deploys automatically.

## 8. Create your real company (tenant) and first admin

A fresh install has no tenant and no user. Run the bootstrap once, **on the server**
(it creates the tenant, the full permission list, an Admin role and your admin user; no
demo data):

```bash
cd /opt/caratflow
TENANT_ID="$(uuidgen)"            # use the SAME value as the GitHub variable TENANT_ID
echo "$TENANT_ID"
TENANT_ID="$TENANT_ID" \
TENANT_NAME="My Jewellers Pvt. Ltd." \
TENANT_SLUG="my-jewellers" \
ADMIN_EMAIL="you@example.com" \
ADMIN_FIRST_NAME="Your" ADMIN_LAST_NAME="Name" \
ADMIN_PASSWORD='a-long-unique-password-12+' \
docker compose -f docker-compose.prod.yml --env-file .env --profile tools run --rm bootstrap-tenant
```

- The password is never printed. Minimum 12 characters.
- It is safe to run again: nothing is duplicated; an existing user's password is only
  changed if you add `RESET_PASSWORD=true`.
- Use the **same UUID** as the `TENANT_ID` GitHub variable (and the same slug as
  `TENANT_SLUG`), so the storefront and the website talk to your tenant. If you create the
  tenant first and want a different id, set the variable and re-run the Deploy workflow.
- Add `DRY_RUN=true` to check your inputs without touching the database.

Then open `https://app.YOURDOMAIN/admin`, enter your **tenant slug**, e-mail and password.
Next steps inside the app: create locations, users/roles, product categories and the
metal rates.

If you used the demo seed instead, the demo tenant is `sharma-jewellers` with logins such
as `admin@sharmajewellers.com` / `admin123` (see the README). **Never keep demo logins on
a real server**: change the passwords or recreate the database.

## Demo data and demo customer login

Optional: fill an empty tenant with a demo catalog so the shop is not empty, and create one
customer who can sign in on the storefront. Run it **on the server**, after step 8:

```bash
cd ~/caratflow   # the folder with docker-compose.prod.yml and .env
TENANT_SLUG=your-slug DEMO_CUSTOMER_PASSWORD='choose-a-password'   docker compose -f docker-compose.prod.yml --env-file .env --profile tools run --rm seed-demo-catalog
```

What it adds (only what is missing, nothing is deleted, a second run adds 0 rows):
a Main Showroom and a warehouse (only if the tenant has no location), 6 categories with
sub-categories, 31 products with HUIDs and stock, metal rates (22K about Rs 6,700/g, 18K about
Rs 5,500/g, 14K about Rs 4,300/g, silver about Rs 90/g) in both the storefront settings and the
admin rate history, 3 hero banners, FAQs, a few reviews, and the demo customer (Priya Sharma,
phone +919820000001, verified e-mail/phone, one address, KYC, 500 loyalty points).

- Re-running the seed also **repairs the home-page data** of an already-seeded tenant: it marks
  8 demo products (SKUs `TB-...`) with `attributes.featured = true` (only that key is added, an
  existing `featured` value is kept) and, only if `storefrontBanners` is missing or empty, adds
  the 3 hero banners to the tenant settings (other settings keys are kept). These show up as
  `...Updated` counts; the next run reports 0 inserted and 0 updated.
- `DEMO_CUSTOMER_PASSWORD` is **required** for the customer login (min 8 characters). Without it
  only the catalog is seeded. It is never printed or stored.
- `DEMO_CUSTOMER_EMAIL` defaults to `demo.customer@example.com`.
- Product and banner images are stored as absolute URLs `https://shop.YOURDOMAIN/images/...`
  (the images ship inside the storefront image; override with `IMAGE_BASE_URL`).
- Add `DRY_RUN=true` to see what would be inserted without writing anything.
- Image sources and licences: `apps/storefront/public/images/CREDITS.md`.

> **Warning:** these are demo products and a demo login with a known e-mail. Remove the demo
> customer and the demo products (SKUs starting with `TB-`) before real launch, and replace the
> demo images with your own photography.

### Full demo data (all modules)

After the catalog seed you can fill the whole admin (customers, CRM, retail sales and returns,
finance, stock movements, manufacturing, wholesale, HR and commerce) with a busy, fictional
jewellery business. Dates are relative to the day you run it (mostly the last 90 days):

```bash
cd ~/caratflow
/opt/caratflow/backup.sh        # 1. ALWAYS take a backup first
TENANT_SLUG=your-slug DOMAIN=your.domain   docker compose -f docker-compose.prod.yml --env-file .env --profile tools run --rm seed-demo-full
```

> **Warning:** this fills the **LIVE** database with fictional data (people, invoices, sales,
> ledger entries). Do not run it on a database that holds real business records, and never
> before the real launch data is loaded.

- Requires the tenant and the catalog (`seed-demo-catalog` first); otherwise it refuses.
- Insert-only and idempotent: a second run inserts 0 rows. Only the catalog stock quantities are
  reduced once, to match the fictional sales.
- `DRY_RUN=true` prints would-insert counts per module and table and writes nothing.
- `ONLY=crm,retail` or `SKIP=finance` limit the modules (`crm`, `retail`, `finance`, `ops`,
  `peopleCommerce`); each module is one database transaction.
- `DEMO_STAFF_PASSWORD='...'` (min 8 characters, never printed) also creates four staff logins
  `sales.demo@`, `accounts.demo@`, `store.demo@`, `karigar.demo@example.com` with matching roles.
- **Going back:** restore the backup (`/opt/caratflow/restore.sh <backup file>`), or wipe the
  database and run `bootstrap-tenant` again (then `seed-demo-catalog` if you want the catalog).

## 9. Daily operations

All commands run on the server in `/opt/caratflow` as `deploy`. Shorthand:

```bash
alias dc='docker compose -f docker-compose.prod.yml --env-file .env'
```

| Task | Command |
| --- | --- |
| See status | `dc ps` |
| Live logs | `dc logs -f --tail=100 api` (also `web`, `caddy`, `mysql`, ...) |
| Which version is live | `cat .last_good_tag` |
| Restart one service | `dc restart api` |
| Update to the latest code | push/merge to `main` (automatic), or run the Deploy workflow |
| Roll back | Actions, Deploy, Run workflow, set `image_tag` to an older commit SHA. (An automatic rollback also happens when a deploy fails its health check.) |

**How the database schema is applied.** The repository has no Prisma migrations folder, so
every deploy runs `prisma db push` (the `migrate` container). It creates/updates tables
and **refuses** changes that would delete data, failing the deploy instead; the running
apps are left untouched. Rollbacks restore the old application version, **not** the
database schema: restore a backup if a schema change must be undone.

## 10. Backups and restore

`server-setup.sh` installed a cron job: every night at 02:30 `backup.sh` writes
`/opt/caratflow/backups/caratflow-db-DATE.sql.gz` (MySQL) and
`caratflow-files-DATE.tar.gz` (uploaded files) and deletes backups older than 7 days.

```bash
/opt/caratflow/backup.sh                                          # backup now
ls -lh /opt/caratflow/backups
/opt/caratflow/restore.sh /opt/caratflow/backups/caratflow-db-YYYYMMDD-HHMMSS.sql.gz
```

`restore.sh` replaces the live database (it asks you to type `RESTORE`). The backups sit
on the same server: **copy them off-site** (another server, object storage; e.g. `rclone`
or `scp` in a second cron job), and **test a restore** on a spare machine before you rely
on them. Also keep your `.env` backed up separately.

## 11. Updating the server itself

Security updates install automatically. Occasionally run `sudo apt update && sudo apt
upgrade` and reboot (`sudo reboot`); the containers restart on their own.

## 12. Adding payment, SMS or WhatsApp keys

Edit `/opt/caratflow/.env`, uncomment and fill the variables for the provider, then:

```bash
dc up -d api
```

Which feature needs which key (all optional; features degrade gracefully, using mock
data or staying disabled, until configured):

| Feature | Variables |
| --- | --- |
| Online payments (storefront checkout, BNPL, digital gold) | `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` (or Stripe / Cashfree) and `PAYMENT_GATEWAY_PROVIDER` |
| PAN / bank / KYC verification | `CASHFREE_VERIFY_CLIENT_ID`, `CASHFREE_VERIFY_CLIENT_SECRET` |
| GST e-invoice / e-way bill | `MASTERS_INDIA_*` |
| OTP and WhatsApp messages | `OTP_CHANNEL`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN` |
| Push notifications | `FCM_SERVER_KEY` |
| Shipping | `SHIPROCKET_EMAIL`, `SHIPROCKET_PASSWORD` |
| Live gold/silver rates | `RATE_PROVIDER`, `RATE_API_URL`, `RATE_API_KEY`, `METALS_DEV_API_KEY`, `MCX_*` |
| Certificate lookup | `GIA_*`, `IGI_*` |
| Social sign-in | `GOOGLE_CLIENT_ID`, `APPLE_*`, `FB_*` |

Webhook URLs to give the providers use `https://api.YOURDOMAIN/...`.

## 13. Security checklist

- [ ] All `CHANGE-ME` values replaced with long random secrets; `.env` is `chmod 600`.
- [ ] No demo logins/data on the production database.
- [ ] Firewall: only 22, 80, 443 open (`sudo ufw status`). MySQL, Redis and the MinIO
      console are not published.
- [ ] SSH key-only: in `/etc/ssh/sshd_config` set `PasswordAuthentication no` and
      `PermitRootLogin no`, then `sudo systemctl reload ssh`. Test a second login **before**
      closing your current session.
- [ ] Backups run, are copied off-site, and a restore was tested.
- [ ] GitHub: protect `main` (require CI), protect the `production` environment (required
      reviewers) if several people have write access, keep `GHCR_PULL_TOKEN` read-only.
- [ ] Swagger stays disabled (`SWAGGER_ENABLED` unset).
- [ ] `docker compose pull` + redeploy happens at least monthly to pick up base-image fixes.

## 14. Troubleshooting

| Symptom | What to check |
| --- | --- |
| Workflow shows everything "skipped" | Repository variable `DEPLOY_ENABLED` is not exactly `true`; or CI was not green for the push. |
| `Missing repository/environment secrets` | Add `SSH_HOST`, `SSH_USER`, `SSH_PRIVATE_KEY`. |
| `Permission denied (publickey)` | Public key not in `/home/deploy/.ssh/authorized_keys`, or the wrong private key in the secret (include the `-----BEGIN` / `-----END` lines). |
| `Host key verification failed` | `SSH_KNOWN_HOSTS` is wrong or the server was reinstalled: re-run `ssh-keyscan` and update the secret. |
| Pull fails with `denied` / `unauthorized` | Package access (section 6) or set `GHCR_PULL_TOKEN`. |
| Browser shows a certificate error / site not reachable | DNS not pointing at the server yet, or ports 80/443 blocked by the cloud provider's firewall. `dc logs caddy` shows certificate attempts. Let's Encrypt has rate limits: wait before retrying many times. |
| `migrate` fails | `dc logs migrate`. A message about data loss means a schema change would drop data; resolve it (or back up and apply manually). MySQL not healthy yet: `dc logs mysql`. |
| API container restarts | `dc logs api`. `JWT_SECRET must be set to at least 32 characters` means the `.env` value is missing/short. |
| Admin shows "Invalid tenant" | Use the tenant **slug** (`TENANT_SLUG`), and make sure the bootstrap (step 8) ran. |
| Login works but pages show network errors | `CORS_ORIGINS` (default covers app/shop/apex/www) or `DOMAIN` mismatch between `.env` and the GitHub variable `DOMAIN`; redeploy after fixing. |
| Uploaded images do not display | `files.YOURDOMAIN` DNS record missing, or the `minio-init` bucket step failed (`dc logs minio-init`). |
| Out of disk space | `docker system df`; `docker image prune -af` removes unused images (never run `docker volume prune` on the server: it can delete your data). |
| Health check times out on first deploy | Certificates still being issued or DNS not ready. Run the workflow again once `https://api.YOURDOMAIN/health` loads. |
