# 部署指南（DEPLOY.md）

v1 是验证版，推荐先用 Fly.io 或 Railway 跑起来给餐馆老板演示。

## 上线前必做

1. **改掉默认密码**：设置环境变量 `ADMIN_PASSWORD`（不要再用 `admin123`）。
2. **换 session 密钥**：设置 `SESSION_SECRET` 为随机长字符串。
3. **删示例数据**：上线前在管理后台停用示例餐馆，或 `npm run reset` 后让真实餐馆重新注册。

## 方案 A：Fly.io

```bash
# 安装 flyctl 并登录
fly launch --no-deploy   # 按提示选名字、区域（选 sea 西雅图最近）
```

`fly.toml` 关键配置：

```toml
[env]
  TZ = "America/Los_Angeles"
  ADMIN_PASSWORD = "换成你自己的强密码"
  SESSION_SECRET = "换成随机长字符串"

[mounts]
  source = "shengcai_data"
  destination = "/data"

[env]
  DB_PATH = "/data/shengcai.db"
```

```bash
fly volumes create shengcai_data --region sea --size 1
fly deploy
```

⚠️ **SQLite 必须挂 volume**：不挂的话每次部署/重启数据都会丢。
`DB_PATH` 指向 volume 挂载路径（`/data/shengcai.db`）。

## 方案 B：Railway

1. 新建项目 → Deploy from GitHub repo（把本目录推到 GitHub）。
2. Variables 里加：
   - `ADMIN_PASSWORD`、`SESSION_SECRET`、`TZ=America/Los_Angeles`
   - `DB_PATH=/data/shengcai.db`
3. 给服务加一个 **Volume**，挂载到 `/data`（否则 SQLite 数据不持久）。

## 方案 C：自己的 VPS（最省事）

```bash
git clone <repo> && cd shengcai-manghe
npm install --omit=dev
ADMIN_PASSWORD='xxx' SESSION_SECRET='yyy' nohup node server.js > app.log 2>&1 &
# 前面加 Nginx 反代 + HTTPS 即可
```

## 注意事项

- Node 版本 ≥ 18（better-sqlite3 v12 需要）。
- 时区：取餐「过期」按 `TZ`（默认 America/Los_Angeles）判定，部署时保持一致。
- 备份：SQLite 就是单个文件，定期把 `data/shengcai.db` 拷一份即可。
- v1 session 在内存里，服务重启后所有人要重新登录；用户量起来后再换持久化 session store。
