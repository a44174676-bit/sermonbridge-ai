# SermonBridge AI — BUFS-inspired UI Design Specification

> Design reference: user-supplied `BUFS_브랜드_가이드라인.pdf` (December 2011). This is an independently developed SermonBridge interface, **not an officially approved BUFS-branded service**.

## Source-specific design principles

- BUFS Gold: RGB 255/203/5, HEX `#FFCB05` (guide p.16 / printed p.14).
- BUFS Charcoal: RGB 85/85/85, HEX `#555555`.
- Mid grey `#969696` and light grey `#CCCCCC` (same table).
- Gold + charcoal block-based, orderly modular square-grid composition (guide pp.8, 24–25).
- Web typography according to historical guide: English Arial, Korean Dotum (guide pp.21 and 23); compatible system fallback for multilingual reading.
- Keep layouts simple, captions large, fewer competing elements (guide pp.43–44).

## Screens covered by shared styling

1. Intro page: clear identity and primary action, prominent hero, gold accent, rectangular cards.
2. Admin dashboard: readable cards and stronger status hierarchy.
3. Sermon creation: 48px+ controls, clear focus states, large form labels.
4. Draft/review: accessible alerts, gold-accented controls, calm paper surface.
5. Projector view: gold and grey accents with no loss of legibility.
6. Mobile viewer: larger translated caption text, responsive controls, high contrast.

## UX and accessibility requirements for follow-on work

- Display original Korean and selected target language without conflating approved text with machine-generated draft.
- Language switch: 한국어 / English / Tiếng Việt / 日本語 / 简体中文 where supported in **operational** mode; do not mislabel three-language demo as supporting all five.
- Target min 44px touch controls, visible keyboard focus, proper heading hierarchy and reduced motion.
- Mark any AI translation that has not been approved as unreviewed.
- No real BUFS logo is bundled, reconstructed, modified or copied. Use independently styled `S` product mark until university usage permission and current master assets are obtained.
- Refer to service as `SermonBridge AI`, not "official BUFS service". Include a clear project attribution in future product UI where university use is proposed.
- The source guide dates from 2011; university brand team should confirm any current revisions and permitted use before official deployment.

## Changes included in this branch

`src/app/globals.css`: typography, palette, header, cards, forms, state badges, focus and mobile viewer styling. No authentication, SQL, secrets, AI policy or application routing changes.

## Verification checklist before merging to production

- [ ] `npm run lint`
- [ ] `npm run typecheck`
- [ ] `npm run build`
- [ ] `npm test`
- [ ] Browser smoke check: desktop and mobile at `/`, `/dashboard`, `/sermons/new`, `/s/demo`
- [ ] Keyboard navigation and high-contrast checks
- [ ] University brand/logo permissions if logo will be used

Do not merge to `main` until visual QA. Netlify currently auto-deploys from main; this branch deliberately does not change production.
