# Yixue Subject Space R1 — Owner Review

This branch is the current product-review build for the Subject Space rearchitecture.

## What to review

Focus on product structure and information flow rather than production deployment:

1. Subject Space icon-grid overview and search.
2. Compact subject identity/header (`‹ C++`).
3. Desktop in-flow Conversation sidebar and mobile Conversation drawer.
4. Learning ↔ Review flow and Conversation source selection.
5. Learning/Review message surfaces and private-resource presentation.
6. Subject State interaction.

## Run the product demo

```bash
npm install
npm run demo:product
```

Open:

```text
http://127.0.0.1:3001
```

The small `产品演示` marker indicates deterministic demo-fixture content. Demo AI/review/memory content is not evidence of a connected real model.

## Run the real local Conversation path

```bash
npm install
npm run dev:local
```

Open:

```text
http://127.0.0.1:3000
```

This path uses the local SQLite-backed Subject / Conversation / user-Message API. It does not generate a fake assistant reply when no model is configured.

## Current verification status

- Product prototype and UX correction accepted for owner review.
- Local Subject / Conversation / Message persistence exists.
- Local authorization uses an explicit DEV_ONLY principal and is not production authentication.
- Real AI model: not connected / not verified.
- Production server environment: not verified yet.
- Production database: not selected yet.

## Important product boundaries

- Conversation is an important Yixue interaction object, not the user's complete learning history.
- Review is optional; Conversation does not automatically become Review or Learning Memory.
- Browsing a Resource does not automatically place it into learning context.
- Ordinary Conversation does not automatically update Learning Memory or Subject State.
