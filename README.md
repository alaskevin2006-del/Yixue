# 逸学 Yixue

逸学当前阶段是静态产品原型，用于验证首页、资料库、学科空间之间的信息架构、页面职责和主要交互流转。

## 本地运行

```bash
npm install
npm run build
npm run preview
```

预览地址默认是：

```text
http://127.0.0.1:4173
```

## 项目结构

- `index.html`：页面结构
- `styles.css`：视觉样式
- `app.js`：前端交互与页面联动
- `docs/`：产品设计 Source of Truth
- `scripts/build.mjs`：静态构建脚本

## 协作说明

涉及产品行为、交互、信息结构或长期状态前，请先阅读 `docs/逸学｜产品行为设计基线.md`，再阅读当前任务相关的 Model / Problem / Vision / Boundary / Principles 文档。
