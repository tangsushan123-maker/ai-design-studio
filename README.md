# AI Design Studio

AI Design Studio 是一个基于 Next.js 的本地/服务器可部署 AI 设计工作台，面向活动海报、品牌物料、参考图重制、画质增强、设计优化、局部 AI 修改、PNG 分层导出和 AI 合成等工作流。

## 主要功能

- 项目工作台：按项目保存素材、策略、节点画布、任务记录和生成结果。
- AI 出图：支持文生图、图生图、参考图重制、画质增强、设计优化、局部蒙版修改和 AI 合成。
- 交付检查：记录尺寸、清晰度、白边、文字/二维码复查、质量建议和交付摘要。
- 素材库：管理 Logo、二维码、IP、照片、参考图、品牌色和风格库。
- 部署检查：`npm run preflight` 会检查 Node 版本、`.gitignore`、密钥、本地数据和生成目录。

## 本地启动

```bash
npm ci
cp .env.example .env.local
```

编辑 `.env.local`，填入：

```bash
OPENAI_API_KEY=你的_API_Key
```

启动开发环境：

```bash
npm run dev
```

浏览器打开 [http://127.0.0.1:3000](http://127.0.0.1:3000)。

## 生产部署

服务器要求：

- Node.js `>=20.9.0`
- npm、git、nginx、pm2
- 可写的项目目录，例如 `/var/www/ai-design-studio`

首次部署：

```bash
cd /var/www
git clone https://github.com/tangsushan123-maker/ai-design-studio.git
cd ai-design-studio
npm ci
cp .env.example .env.local
```

编辑 `.env.local` 并填入 `OPENAI_API_KEY` 后执行：

```bash
npm run preflight
npm run build
pm2 start ecosystem.config.cjs
pm2 save
```

默认监听 `127.0.0.1:3000`，PM2 会在内存超过 1GB 时自动重启服务。用 nginx 反向代理到域名即可让别人通过网站访问。完整 nginx 示例见 [docs/production-deploy.md](docs/production-deploy.md)。

更新服务器版本：

```bash
cd /var/www/ai-design-studio
git pull
npm ci
npm run preflight
npm run build
pm2 reload ecosystem.config.cjs --update-env
```

## 验证命令

每次改代码后建议按顺序执行：

```bash
npm test
npm run typecheck
npm run lint
npm run build
```

部署前额外执行：

```bash
npm run preflight
```

## 重要文件

- `app/`：Next.js 页面和 API 路由。
- `components/workbench/`：工作台 UI 组件。
- `lib/`：模型配置、提示词、图片处理、项目数据和质量检查逻辑。
- `docs/production-deploy.md`：服务器部署说明。
- `ecosystem.config.cjs`：PM2 生产服务配置。
- `docs/known-issues.md`：当前已知限制和后续优化方向。
- `public/generated/`：本地生成图片目录，只保留 `.gitkeep`，不要提交生成图片。

## 不要提交的内容

这些文件只属于本地或服务器运行环境，不应进入 Git：

- `.env`、`.env.local`
- `config.local.json`
- `projects.local.json`
- `task-runs.local.json`
- `style-libraries.local.json`
- `public/generated/*`
- `node_modules/`
- `.next/`
