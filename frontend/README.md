# 逸学前端

## 本地开发

```powershell
npm ci
npm run dev
```

打开终端显示的本地地址。开发环境默认启动 MSW。普通同学用 `student@example.test`，管理员用 `admin@example.test`，本地验证码均为 `123456`。模拟会话保存在当前浏览器标签页。

首页和导航提供资料征集入口，导航提供「我要投稿」。可以测试征集详情、预填投稿、附件上传检查、发布和预览。演示投稿和上传文件仅保留在页面内存，完整刷新会重置。个人投稿编辑、撤回及后台管理留待后续接入。

需要用本机 PDF 测试时，在 `.env.local` 中设置 `YIXUE_SAMPLE_PDF_DIR=../前端测试资料`，然后重启开发服务器。样本会出现在首页近期更新中，应用直接从该文件夹读取原件。测试样本仅供本机开发环境使用，生产构建不会打包这些文件。

## 接口联调

在 `.env.local` 中设置 `VITE_ENABLE_MOCKS=false` 与 `YIXUE_API_PROXY`，重启 Vite 即可将 `/api/v1` 请求代理到后端。前端通过 `/auth/start` 和 `/auth/verify` 对接邮箱验证码，发送邮件、校验验证码和设置会话 Cookie 由后端处理。`src/api/types.ts` 暂按开发方案中的接口草案手写，契约冻结后改为 OpenAPI 生成。

生产构建使用同域 `/api/v1`。生产站点需要将前端路由刷新回退到 `index.html`，并为正式站点配置 `VITE_SITE_URL`。生产包不包含本地 Mock 实现。

```powershell
npm run lint
npm run build
```
