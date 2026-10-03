# 逸学 Yixue — Subject Space R1 Owner Review

当前 review 分支用于领导评审学科空间 R1 的产品结构、前端交互和信息流，不代表生产部署已经完成。

## 推荐评审入口

```bash
npm install
npm run demo:product
```

打开：

```text
http://127.0.0.1:3001
```

右上角会显示低权重的「产品演示」标识。演示中的 AI 对话、回顾、候选学习记忆、资料内容和 Subject State 都是确定性的 Demo Fixture，用于评审产品交互，不代表真实 AI 已接入。

详细评审路径见 [PRODUCT_REVIEW_GUIDE.md](./PRODUCT_REVIEW_GUIDE.md)。

## 真实本地 Conversation 路径

如果需要查看已经落地的本地数据链路：

```bash
npm run dev:local
```

打开：

```text
http://127.0.0.1:3000
```

这一模式使用本机 SQLite 保存 Subject、Conversation 和用户 Message，并保留真实服务端鉴权/隔离边界；当前没有配置真实模型，因此不会伪造 assistant 回答。

## 当前主要评审点

- 学科空间图标网格与搜索
- 紧凑的 `‹ C++` 学科身份
- 桌面 in-flow Conversation sidebar
- 移动端 Conversation drawer
- 学习 ↔ 回顾的信息流
- 用户 / 逸学消息视觉层级
- 私人资料与显式「用于当前学习」
- Subject State 的查看 / 编辑 / 采用边界

## 当前边界

- Conversation 是逸学中的重要学习交互，不等于用户完整真实学习过程。
- Review 是可选流程，不会自动由每次 Conversation 触发。
- 浏览资料不等于资料自动进入当前 AI Context。
- 普通 Conversation 不会自动写入 Learning Memory 或 Subject State。
- Production DB、生产身份、真实 AI endpoint、服务器部署仍未冻结。

## 产品 authority

产品行为、交互、信息结构和长期状态仍以 `docs/` 以及原始 Problem / Vision / Boundary / Principles 为上位约束。
