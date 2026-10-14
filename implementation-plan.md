# 用户端原型实施计划 · 2026-10-14

> 按 superpowers:executing-plans 逐项实施、自检。用户已授权按已确认设计实施、开分支、更新 GitHub 和服务器。

**Goal:** 在北京时间今日12:00前交付可验收的用户端交互原型。
**Architecture:** 原生 HTML/CSS/ES modules；文本与演示聊天保存在当前浏览器，文件 Blob 独立存储在 IndexedDB。保留既有本地 Conversation API 路径，不新增生产数据库、真实 AI 或管理员系统。
**Tech Stack:** JavaScript、Node、CSS、浏览器存储、node:test。
**Spec:** 本聊天用户2026-10-14的两次最终说明，以及 docs/ 上位约束。最新明确要求优先：规划文本独立于学科空间；回顾为文档列表，非卡片仪表盘；资料为文件。

## Global Constraints
- 首页以日程为主体；日/周预览均可用；规划聊天独立，保留历史。
- 规划的学科文本由用户维护，聊天和日程不会自动更新；不读取学科空间。
- 学科对话、回顾文档、文件严格按当前学科过滤；新对话归属当前学科。
- 回顾只显示一串文档条目；打开后查看、编辑、下载，可删除并撤销。
- 资料提供真实本地文件选择、打开和下载；公共资料/私人文件/投稿三域独立。
- 资料库保持课程列表布局，右上只保留我要投稿；我的投稿位于投稿内部。
- 所有原型保存须明确为本浏览器保存；未连接AI不伪造新回答或审核成功。
- 不修改 docs/ 产品定义，不上传本地用户数据或SQLite数据库。

## Review Focus
1. 跨学科切换、旧地址或快速点击不能泄露其他学科数据。
2. 编辑取消、刷新、存储写入失败不误报成功或丢失旧文本。
3. 恶意文件名/HTML输入必须作为文本呈现；下载保留实际字节。
4. 320px/390px宽度下导航、输入、文档和文件操作可达。
5. 发布仅静态原型资源，版本可追溯且保留回滚，不覆盖服务器用户数据。

## Task 1: 状态边界及可测试基础
Files: client/model.js, client/storage.js, client/fixtures.js, tests/model.test.js
Interfaces: createInitialState(), reduce(state, action), scoped(state, subjectId), load/save storage.
- [x] 先写并运行隔离、文档CRUD、规划文本独立、取消与错误路径测试（先红后绿）。
- [x] 实现可持久化原型状态及独立文件存储。
- [x] 通过 node --test tests/model.test.js，提交。

## Task 2: 用户页面及交互
Files: index.html, app.js, styles.css, client/views.js
Interfaces: render route from state; dispatch actions through model; files through IndexedDB adapter only.
- [x] 首页日/周和独立规划聊天、状态文本编辑。
- [x] 资料库/投稿内部页面、私人文件。
- [x] 学科隔离、对话、文档列表及编辑下载删除撤销。
- [x] 构建与浏览器桌面/手机自检，修复实际问题，提交。

## Task 3: 验证与发布
Files: scripts/build.mjs, scripts/serve-product-demo.mjs, server/static.js, tests/backend/*.test.js, acceptance-report.md
- [x] 保持既有本地API可用；增加必要后端回归测试，运行全部已有命令。
- [x] 全分支独立审查并修复重要问题。
- [x] 推送已验证分支，创建草稿PR；按确认的服务器目标更新静态原型并验证线上版本。
- [x] 记录测试、桌面/手机检查、GitHub与线上地址及限制，准备12:00验收。
