# 逸学部署与恢复

## 首次运行

要求 Node24。`npm ci` 安装锁定依赖，复制 `.env.example` 到 `.env`，设置独立的应用管理员密码（至少10字符）和模型配置，然后 `npm run dev:local`。应用会将首次管理员密码哈希保存；后续重启不重置密码。SSH密码不是应用密码。

未配置模型时可操作账号、资料、现状等真实存储功能；AI任务明确失败，不会返回演示答案。这不等于完整AI验收通过。

用户已确认使用DeepSeek官方，允许交付时保留空密钥。`.env.example`已预设 `https://api.deepseek.com`、`deepseek-flash`、图片能力及非思考模式，只需在服务器 `.env` 填入 `YIXUE_AI_API_KEY` 并重启应用即可启用。密钥只在服务端读取，不进入页面或数据库。默认非思考模式减少互动等待；如启用思考模式，需相应增加输出预算和超时并重新验收。官方契约核验日期2026-10-13：[Chat Completions](https://api-docs.deepseek.com/api/create-chat-completion/)、[图片输入](https://api-docs.deepseek.com/guides/vision/)。图片/扫描PDF链路已通过测试适配器验证；真实识别效果需填密钥后实测。

`npm test` 运行后端和前端逻辑测试。`npm run test:e2e` 构建并运行浏览器验收（测试专用外部模型替身，不代表真实模型效果）。

## Linux服务器 / Docker Compose

1. 核验机器、已有服务、磁盘及端口，保留现有服务，不覆盖其他应用。
2. 在独立目录放置本项目，安装Docker及Compose（如尚未安装）。
3. `.env` 设置 `YIXUE_ORIGIN=https://实际域名`、`SITE_ADDRESS=实际域名`、应用管理员及模型配置；文件权限设为600。不得保留空管理员密码，不得公开模型密钥。
4. 创建 `deploy-data/app/uploads` 并使容器用户UID1000可写；容器以非root运行。其他目录由Caddy建立。
5. 确认域名指向本机，80/443可用。执行 `docker compose up -d --build`。
6. 检查健康接口、HTTPS证书、登录、真实AI回答、上传下载；不能只看容器启动状态。
7. `docker compose logs --tail=100 app` 只记录请求编号、状态和耗时；不记录正文或密钥。

应用3000端口只在Compose内部暴露。使用已有反向代理时仅部署app，将内部端口映射到127.0.0.1并配置既有代理，不直接公开开发服务。

无域名时可以评估公开IP证书：Let's Encrypt已支持IP短期证书，Certbot5.4+支持webroot签发，需要80端口验证及自动续期/服务重载；必须实际核验证书可信链。不要用关闭证书校验作为交付方式。来源：https://letsencrypt.org/2026/03/11/shorter-certs-certbot/

### 只有公开IP的部署

已提供 `compose.ip.yaml`、`deploy/Caddyfile.ip` 及证书签发/续期脚本。适用于已核实80/443空闲且可从公网访问的Linux服务器；下面的IP应替换为实际服务器IP。

1. 将 `.env` 中 `SITE_ADDRESS` 设为公开IP，`YIXUE_ORIGIN` 设为 `https://公开IP`。
2. 启动代理前，先执行 `bash deploy/ip-certificate.sh issue 公开IP --staging` 测试签发。测试证书存入独立目录，不会供网页使用。
3. 测试成功后执行 `bash deploy/ip-certificate.sh issue 公开IP` 获取受信任证书。脚本不会擅自停止占用80端口的既有服务；已有代理的机器需改用其webroot。
4. 执行 `docker compose -f compose.yaml -f compose.ip.yaml up -d --build`。IP部署后所有Compose操作均使用这两个文件。
5. 执行 `bash deploy/ip-certificate.sh renew --dry-run` 验证无中断续期。代理HTTP入口仅用于挑战验证和重定向，应用通过HTTPS访问。
6. 部署路径为 `/opt/yixue` 时，将 `deploy/yixue-ip-renew.service` 和 `.timer` 复制到 `/etc/systemd/system/`，执行 `systemctl daemon-reload` 和 `systemctl enable --now yixue-ip-renew.timer`。使用其他路径需先更新service内的两处路径。
7. 查看 `systemctl list-timers yixue-ip-renew.timer`，实际打开HTTPS并核验证书。IP证书仅6天有效，续期任务每12小时检查并在成功后重载代理。签发、续期失败必须查日志解决，不能只确认timer已安装。

签发脚本未绑定通知邮箱；需要邮件联系地址时可按运维要求在Certbot账户补充。实际部署前必须完成上述签发、续期和可信链验收，配置文件存在并不代表证书已签发。

## 更新与回滚

发布前保存当前提交/镜像标识并完成离线备份。新版本包含数据库迁移，保留原始对象，不删除数据库重建。更新失败先停止新进程，根据兼容性恢复上一镜像；如果迁移不兼容，恢复成对的数据库与文件备份，不能只回滚程序后继续写不兼容数据库。

## 备份 / 恢复

备份是数据库和文件的一致性快照，因此先停止应用写入。`--offline` 是操作者确认已停止应用，不会自动停止其他机器上的进程。不要对仍在写入的目录使用它。

本机：停止服务后执行 `node scripts/backup.mjs backup .data backups/唯一时间名 --offline`。

容器：先 `docker compose stop app`。可用相同Node24镜像运行备份脚本，将宿主 `deploy-data/app` 与独立备份目录挂载，或在宿主安装Node24后执行 `node scripts/backup.mjs backup deploy-data/app backups/唯一时间名 --offline`。完成后立即 `docker compose start app`。备份失败也应重新启动原服务并记录失败。

恢复：停止应用，在新目录执行 `node scripts/backup.mjs restore backups/备份名 新数据目录 --offline`。脚本校验清单、SHA256、SQLite完整性和文件关联，拒绝覆盖已有目录。恢复验证通过后将应用数据目录指向新目录，保留原目录以便回滚，重启并实际登录/读取资料。

备份含用户私人内容，应存放在受限目录并另存一份异机副本；仅同盘副本不能覆盖磁盘损坏。生产定时备份频率和异机位置在服务器可访问后配置并实测。

## 已知部署前置条件

实际部署验收见 `engineering/acceptance.md`。不要复用测试模型启动生产版本。

## 当前服务器运维

线上地址为 `https://124.221.230.69/`，目录 `/opt/yixue`，使用两个 Compose 文件。管理员初始密码保留在服务器权限600的 `.env`，不提交到GitHub。模型密钥仍按用户要求留空。

IP访问的TLS客户端通常不发送SNI，Docker监听地址又是私有IP，因此 `Caddyfile.ip` 明确设置 `default_sni` 为公开IP。已用未关闭证书验证的curl和真实浏览器确认。参考：[Caddy全局配置](https://caddyserver.com/docs/caddyfile/options#default-sni)。

`yixue-backup.timer` 每天04:30 UTC（北京时间12:30）运行 `backup-server.sh`。脚本短暂停止app，使用当前应用镜像成对备份SQLite和文件，然后重新启动；失败路径也会尝试启动app。SQLite校验可能创建WAL/SHM，因此停止写入后备份源挂载可写。备份目录 `/opt/yixue/deploy-data/backups`，归档附SHA256。当前保留全部快照，定期关注磁盘空间。证书与密钥不进入这些业务数据归档；`.env`需另行安全保管。

异机副本存放在本机 `C:/Users/Kevin/Yixue-backups`，目录访问限制为当前用户和SYSTEM。Windows计划任务 `Yixue-Offsite-Backup` 每日13:00及用户登录时运行 `sync-backups.py`，补拉缺少的归档并检查SHA256。电脑必须开机、用户已登录且网络可用；关机期间服务器仍每日备份，下一次本机任务运行时补拉。SSH密钥在用户 `.ssh/yixue-deploy`，不在Git中。

手动备份：`sudo systemctl start yixue-backup.service`。查看结果：`sudo journalctl -u yixue-backup.service -n 30`。本机手动同步：`python deploy/sync-backups.py --destination C:/Users/Kevin/Yixue-backups --key C:/Users/Kevin/.ssh/yixue-deploy`。

填DeepSeek密钥：编辑服务器 `/opt/yixue/.env` 的 `YIXUE_AI_API_KEY`，再在该目录执行 `sudo docker compose -f compose.yaml -f compose.ip.yaml up -d --force-recreate app`（修改环境变量不能仅用restart）。之后实际验证模型回答/图片识别；此前不声称已通过真实模型验收。
