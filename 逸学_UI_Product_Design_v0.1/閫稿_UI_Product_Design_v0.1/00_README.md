# 逸学 UI / Product Design v0.1

> 用途：作为当前网页重构时的产品与界面设计 Source of Truth，供 Codex、Figma Agent 和人工开发共同读取。
>
> 本包不重新定义 Problem / Vision / Boundary / Model；它把已有上位约束落实为可执行的产品行为、页面结构和视觉验收规则。

## 1. 读取顺序

开发或修改页面前，按以下顺序读取：

1. 项目上位约束：`逸学 Problem / Vision / Boundary / Principles` 与各域 `Model`；
2. `逸学｜产品行为设计基线.md`；
3. 本包 `01_PRODUCT_DESIGN.md`；
4. 当前任务对应的 `use-cases/UC-*.md`；
5. 当前页面对应的 `pages/P-*.md`；
6. `04_VISUAL_DESIGN.md`；
7. `05_VISUAL_ACCEPTANCE.md`；
8. `06_AGENT_IMPLEMENTATION_RULES.md`。

现有代码和现有页面只代表“当前实现”，不具有高于上述文档的设计权威。

## 2. 文档层级

```text
Problem / Vision / Boundary / Principles / Model
                    ↓
       产品行为设计基线
                    ↓
          PRODUCT_DESIGN
                    ↓
              Use Case
                    ↓
              Page Spec
                    ↓
      Visual Design / Acceptance
                    ↓
               Implementation
```

发生冲突时，上层优先。Agent 不得为了迁就现有组件或代码结构，反向改变产品语义。

## 3. 当前顶层信息架构

```text
首页
资料库
学科空间
```

- **首页**：学习行动辅助。帮助用户结合现实变化判断和安排近期行动，不拥有学科状态。
- **资料库**：公共资料查找与资料投稿。
- **学科空间**：一个学科的持续学习上下文，承载学习对话、回顾/学习记忆、该学科私人资料与学科现状入口。

三个入口不是必须依次完成的“学习闭环”，用户可按当前需要直接进入任一入口。

## 4. 一个需要显式记录的旧文档冲突

旧版《资料库 Model》仍把 `Private Resource` 作为资料库内部独立资料域；后续视觉方案与已确认产品决定已把私人资料放入对应 `Subject Space`，顶层资料库只保留公共资料与投稿。

**本 UI 设计包按后者执行。** 这属于需要后续同步修订旧 Model 文档的已知差异，Agent 不得自行折中为“资料库和学科空间各放一份私人资料”。

## 5. 本包范围

本包定义：

- 顶层产品职责与跨模块关系；
- 当前 MVP 的核心 Use Case；
- 页面默认结构、主任务与渐进呈现方式；
- 视觉语言；
- 页面级验收与 Agent 实施方式。

本包不定义：数据库 schema、API、Agent 内部编排、RAG 实现、模型选择、部署架构，以及文档中尚未确认的产品功能。
