# 学习连续性 Model

## 1. 核心对象

### Conversation
一次原始学习对话，属于一个 `Subject Space`，可由用户删除。

### Learning Memory Item
一条值得跨对话保留的学习信息。

同一个学习点跨 Conversation 持续更新同一个 Item，不因语义变化重复创建。

---

## 2. 状态

`Learning Memory Item` 只有两种扫描状态：

- **Active**：仍有值得继续推进的内容，AI 默认扫描。
- **Inactive**：已形成可复用认识且没有待解决内容，不再默认扫描。

Inactive 不等于失效或删除。

---

## 3. 内容

每个 Item 只保留：

- 当前最小充分内容；
- 来源 Conversation；
- 必要时的少量关键演化节点；
- Inactive 后用于历史扫描的极简摘要。

演化链仅在认知变化本身具有未来价值时保留。

---

## 4. 关系

```text
Subject Space
├─ Conversation
└─ Learning Memory Item
     ├─ 可由多个 Conversation 更新
     └─ 可包含少量关键演化节点
```

不同 Subject Space 的 Conversation 与 Learning Memory Item 默认隔离。

---

## 5. 不变量

1. 默认不沉淀，一个 Conversation 可以产生 0 个 Item。
2. 只保留未来可能实质影响学习、复盘、复习或 AI 辅助，且无法由通用知识和当前上下文可靠重建的信息。
3. 同一个学习点只维护一个当前 Item。
4. Item 形成可复用认识且没有待解决内容后转为 Inactive。
5. 后续由历史点生发出的新问题默认创建新 Item，旧 Item 按需作为背景。
6. AI 推断只有在证据较强且具有明确未来价值时才可沉淀，并始终只作为参考。
7. 长期记忆遵循最小充分原则，不保存 Agent 可根据 Model、通用知识或上下文自行补全的信息。