# Production Deploy

This project is a Next.js app with local JSON persistence for configuration, projects, task runs, and generated image metadata.

## Server Requirements

- Node.js 20.9 or newer.
- npm, git, nginx, and pm2.
- A writable project directory. Runtime files such as `config.local.json`, `projects.local.json`, `task-runs.local.json`, and `public/generated/` must stay on the server and must not be committed.

## First Deploy

```bash
cd /var/www
git clone https://github.com/tangsushan123-maker/ai-design-studio.git
cd ai-design-studio
npm ci
cp .env.example .env.local
```

Edit `.env.local` and set `OPENAI_API_KEY`. You can also configure the API provider from the app settings page after the site starts.

```bash
npm run preflight
npm run build
pm2 start npm --name ai-design-studio -- start
pm2 save
```

The app listens on port `3000` by default.

## Nginx Reverse Proxy

Use nginx to expose the app on a public domain:

```nginx
server {
  listen 80;
  server_name your-domain.com;

  client_max_body_size 30m;

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
  }
}
```

After editing nginx config:

```bash
nginx -t
systemctl reload nginx
```

## Updating The Site

```bash
cd /var/www/ai-design-studio
git pull
npm ci
npm run preflight
npm run build
pm2 restart ai-design-studio
```

## Safety Checks

- Do not commit `.env.local`, `config.local.json`, `projects.local.json`, `task-runs.local.json`, or `public/generated/*`.
- Back up local JSON files and `public/generated/` before moving servers.
- If generation fails after deploy, open `/settings`, verify the provider, test the text model, then run a full image model test.
- Server diagnostics are available from `GET /api/health-openai`; check `diagnostics.nodeVersion`, `diagnostics.runtime`, and `hasKey` before debugging nginx.
