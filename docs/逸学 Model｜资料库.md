# 资料库 Model

## 1. 模型范围

资料库 Model 只描述资料库自身的稳定对象、内部关系与必要不变量。

---

## 2. 核心对象

### 2.1 Public Resource

公共资料。

`Public Resource` 按学校实际授课的 `Course` 组织。

### 2.2 Private Resource

用户私人资料。

`Private Resource` 是用户私人保存和使用的资料，独立于 `Public Resource` 与 `Submission Resource`

### 2.3 Submission Resource

`Submission Resource` 是通过投稿入口提交的资料，与 `Public Resource`、`Private Resource` 属于独立资料域。

投稿被收录后产生独立的 `Public Resource`，原 `Submission Resource` 不原地转换。

### 2.4 Course

学校实际授课课程，是公共资料的基本组织单位。

例如：

- 高等数学（上）
- 高等数学（下）
- 概率论与数理统计

不同实际课程彼此平级。

资料类型、年份、教师等只作为辅助分类或检索信息，不构成固定完整的资料分类体系。

---

## 3. 核心关系

```text
Course
└─ Public Resource

Private Resource

Submission Resource
└─ 被收录后产生独立 Public Resource
```

其中：

- `Course` 组织 `Public Resource`；
- `Private Resource` 独立存在；
- `Submission Resource` 独立存在；
- `Submission Resource` 被收录后产生新的 `Public Resource`。

---

## 4. 必要不变量

1. `Public Resource`、`Private Resource`、`Submission Resource` 是三个独立资料域，不是同一资料的不同公开状态。
2. `Submission Resource` 不依赖 `Private Resource`。
3. `Submission Resource` 被收录后产生独立的 `Public Resource`，不原地转换。
4. `Public Resource` 按学校实际授课的 `Course` 组织。
5. 不因资料类型、年份、教师等辅助分类信息建立新的核心资料层级。
