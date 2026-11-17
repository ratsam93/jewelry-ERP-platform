# deploy/

Production deployment files for CaratFlow (Docker on your own Linux server, deployed
from GitHub Actions). The full step-by-step guide is in
[docs/DEPLOYMENT-DOCKER.md](../docs/DEPLOYMENT-DOCKER.md).

| File | Purpose |
| --- | --- |
| `docker-compose.prod.yml` | The whole stack: Caddy, api, web, storefront, website, MySQL, Redis, MinIO, one-shot `migrate` / `minio-init`, on-demand `seed-demo` / `bootstrap-tenant` |
| `Caddyfile` | HTTPS reverse proxy for `app.`, `shop.`, `api.`, `files.`, the apex and `www.` |
| `.env.production.example` | Every server-side variable, with comments (copy to `/opt/caratflow/.env`) |
| `server-setup.sh` | One-time Ubuntu setup: Docker, `deploy` user, firewall, auto-updates, backup cron |
| `remote-deploy.sh` | Runs on the server during a deploy: pull, migrate, start, health check, rollback |
| `backup.sh` / `restore.sh` | Daily MySQL (+ uploads) backup with 7-day retention, and restore |

The Dockerfiles are in [`../docker`](../docker) and the workflows in
[`../.github/workflows`](../.github/workflows) (`deploy.yml`, `docker-build.yml`).
