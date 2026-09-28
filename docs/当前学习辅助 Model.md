# 当前学习辅助 Model

## 1. 范围

描述当前学习交互中，原始对话、必要外部信息、当前回答上下文与稳定回答规则之间的关系。

不定义 Context Processor、压缩、选择、推理编排等具体机制。

## 2. 核心对象

### Conversation

一次原始学习对话。

### Current Context

由当前 `Conversation` 及必要外部信息实时构造、用于当前回答的最小充分有效上下文。

## 3. 回答输入

### System Prompt

当前学习辅助长期稳定的回答规则，不承载随对话变化的当前状态。

`System Prompt` 与 `Current Context` 共同作为回答依据：

```text
         Conversation
              ↓
       Current Context
              │
System Prompt ─┤
              ↓
            Answer
```

## 4. 必要不变量

1. `Conversation` 保留原始交互，`Current Context` 不覆盖原始信息。
2. `Current Context` 只保留会实质影响当前回答的信息，遵循最小充分原则。
3. `Current Context` 随当前问题变化；不再影响当前回答的信息应退出。
4. `Current Context` 只服务当前交互，不承担长期学习状态或长期记忆职责。
5. `Current Context` 中的信息不得改变其证据性质；原始表达、外部信息与系统推断必须保持可区分。
6. 信息进入 `Current Context` 不意味着其应被长期保存。
7. `System Prompt` 只承载长期稳定规则，不用于维护动态 Context。
