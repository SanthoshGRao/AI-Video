# Pricing, Cost of Goods, and Credit Design

Derived from the actual call sites in `src/`. Verify provider list prices before launch —
rates below are the assumption set, not gospel.

## 0. Assumptions

| Item | Value |
|---|---|
| USD → INR | ₹88 |
| GPT-4o | $2.50 / 1M in, $10.00 / 1M out |
| GPT-4o-mini | $0.15 / 1M in, $0.60 / 1M out |
| Gemini 2.5 Flash | $0.30 / 1M text in, $1.00 / 1M audio in, $2.50 / 1M out |
| Gemini 3.x Flash TTS (preview) | ~$0.50 / 1M in, ~$10.00 / 1M audio out |
| Audio tokenisation | ~32 tokens per second of audio |
| Reference video | 45 s, 9:16, 1080p, 15 property photos, ~110-word script |

## 1. Where money is actually spent (call sites)

| Feature | Code | Provider (primary → fallback) |
|---|---|---|
| Fact extraction | `src/lib/ai/extract-facts.ts` | GPT-4o |
| Script generation (×3 variations) | `api/projects/[id]/generate-script/route.ts` | Gemini 2.5 Flash → GPT-4o |
| Script refine | `api/projects/[id]/refine-script/route.ts` | Gemini 2.5 Flash → GPT-4o |
| Photo analysis (per image) | `src/lib/media/analyze-image.ts` | **GPT-4o vision** |
| TTS normalisation | `synthesize-voiceover.ts` + `google-cloud-tts.ts` | Gemini 2.5 Flash (**runs twice** for non-English) |
| Voice synthesis | `google-cloud-tts.ts` | Gemini 3.1 Flash TTS → Edge TTS (free) |
| Word/phrase alignment | `gemini-stt-align.ts` | Gemini 2.5 Flash (audio in) |
| AI auto-edit timeline | `src/lib/timeline/generate-ai.ts` | **GPT-4o** |
| Subtitle translate | `api/projects/[id]/subtitles/translate/route.ts` | **GPT-4o** → Gemini |
| Social captions / titles | `generate-social`, `titles` | GPT-4o |
| Facts align | `api/projects/[id]/facts/align/route.ts` | GPT-4o → Gemini |
| Export render | `src/lib/editor/export-render.ts` | Remotion → FFmpeg (your server CPU) |
| Transliteration, sound search, fonts | `transliterate`, `sounds/search` | Free APIs |

## 2. Unit COGS per action

| # | Action | Token / unit math | USD | **INR** |
|---|---|---|---|---|
| A | Fact extraction | 1.2k in + 0.4k out @ 4o | $0.0070 | **₹0.62** |
| B | Script pack (3 variations) | 3 × (1.3k in + 0.22k out) @ Gemini | $0.0028 | **₹0.25** |
| B2 | Same, on GPT-4o fallback | | $0.0164 | ₹1.44 |
| C | Refine one script | 1.5k in + 0.25k out @ Gemini | $0.0011 | **₹0.10** |
| D | Photo analysis, per image | 965 in + 150 out @ 4o vision | $0.0039 | **₹0.35** |
| D2 | Same, on 4o-mini | 3.0k in + 150 out | $0.0005 | ₹0.05 |
| E | Voiceover, 45 s | normalise ×2 + TTS + STT align | $0.0197 | **₹1.73** |
| E2 | → per second of audio | | | ₹0.038 |
| F | Voice style preview (10 s) | TTS only | $0.0036 | **₹0.32** |
| G | Subtitle re-align (no new TTS) | STT only | $0.0034 | **₹0.30** |
| H | Subtitle translate | 1.5k in + 0.9k out @ 4o | $0.0128 | **₹1.13** |
| I | AI auto-edit timeline | 3k in + 2k out @ 4o | $0.0275 | **₹2.42** |
| J | Social captions / titles | 1.2k in + 0.5k out @ 4o | $0.0080 | **₹0.70** |
| K | Web export, 45 s 1080p | 1,350 frames on a 4-vCPU worker, at ~30% fleet utilisation | | **₹1.20** |
| K2 | Desktop export | runs on the user's own GPU | | **₹0.00** |
| L | Storage + egress per project | ~75 MB on R2, 6-month retention, egress free | | **₹1.00** |
| M | Manual editing, saves, playback, re-download | no provider call | | **₹0.00** |

### Voiceover cost breakdown (the one people ask about)

For a 45 s script:

| Stage | INR | Share |
|---|---|---|
| Text normalisation (Gemini Flash, ×2 for Kannada/Hindi) | ₹0.15 | 9% |
| Gemini TTS audio output (1,440 audio tokens) | ₹1.28 | 74% |
| STT alignment for word timings | ₹0.30 | 17% |
| **Total** | **₹1.73** | |

Audio output dominates and scales linearly with duration — charge voiceover **by
seconds**, not per call.

## 3. Cost of one finished video

| Line | Qty | INR |
|---|---|---|
| Fact extraction | 1 | 0.62 |
| Script pack | 1 | 0.25 |
| Photo analysis @ ₹0.35 | 15 | 5.25 |
| AI auto-edit timeline | 1 | 2.42 |
| Voiceover 45 s | 1 | 1.73 |
| Social captions | 1 | 0.70 |
| Web export | 1 | 1.20 |
| Storage lifetime | 1 | 1.00 |
| **First-pass COGS** | | **₹13.08** |
| Realistic (2 script packs, 1 refine, 3 voice previews, 2 VO, 2 exports) | | **₹17.52** |

Photo analysis on GPT-4o is 40% of the bill. See §7.

## 4. Fixed monthly infrastructure

Sized for ~500 monthly active users / ~200 paying.

| Service | USD/mo | INR/mo |
|---|---|---|
| Vercel Pro | 20 | 1,760 |
| Supabase Pro (Postgres) | 25 | 2,200 |
| Clerk (free ≤10k MAU) | 0 | 0 |
| Redis (Railway / Upstash) | 10 | 880 |
| Render worker (4 vCPU dedicated) | 40 | 3,520 |
| Cloudflare R2 | 5 | 440 |
| Domain, transactional email, monitoring | 15 | 1,320 |
| **Total** | **~$115** | **~₹10,120** |

At 200 paying users that is **₹51 per paying user per month** of fixed cost.

## 5. Money that leaves before you see it (India)

| Item | Rate | On ₹1,499 |
|---|---|---|
| Razorpay fee | 2% + 18% GST on the fee = **2.36%** | ₹35 |
| GST on your sale (if priced inclusive) | 18% → divide by 1.18 | ₹229 |
| **Net collected** | | **₹1,235** |

Decide early whether plan prices are GST-inclusive (simpler for B2C, what the table
below assumes) or exclusive (better if most customers are GST-registered agencies who
claim input credit).

## 6. Credit system

**1 credit = ₹1 of retail value.** Credit prices are set at ~3.8× COGS.

| Action | COGS | **Credits** |
|---|---|---|
| Extract property facts | ₹0.62 | **2** |
| Generate script pack (3 variations) | ₹0.25 | **4** |
| Refine one script | ₹0.10 | **1** |
| Analyse a photo | ₹0.35 | **1** per photo |
| AI auto-edit (build timeline) | ₹2.42 | **10** |
| **Voiceover** | ₹0.038/s | **3 per 15 s** (30 s = 6, 45 s = 9, 60 s = 12) |
| Voice style preview | ₹0.32 | **1** |
| Re-align subtitles | ₹0.30 | **1** |
| Translate subtitles | ₹1.13 | **4** |
| Social captions / titles | ₹0.70 | **2** |
| Web export, 1080p ≤60 s | ₹1.20 | **8** (+4 per extra 30 s) |
| Web export, 4K | | **20** |
| **Desktop export** | ₹0.00 | **0 — unlimited** |
| **Manual editing, saves, playback, re-download** | ₹0.00 | **0** |

A complete 45 s video = 2 + 4 + 15 + 10 + 9 + 2 + 8 = **50 credits** against ₹13.17 COGS.

## 7. Plans

| Plan | ₹/mo (GST incl.) | Credits | Videos (clean / rework) | COGS at 100% burn | Net revenue | Margin |
|---|---|---|---|---|---|---|
| Free | ₹0 | 60 one-time, 720p, watermark | 1 | ₹16 | −₹16 | acquisition |
| Starter | **₹599** | 500 | 10 / 7 | ₹131 | ₹493 | **73%** |
| Pro | **₹1,499** | 1,600 | 32 / 21 | ₹419 | ₹1,235 | **66%** |
| Studio | **₹3,999** | 5,000 | 100 / 66 | ₹1,308 | ₹3,295 | **60%** |

"Clean" is one pass with no regeneration; "rework" is the realistic path from §3. Size the
grant against the rework column — that is what a working agent actually consumes.

Top-ups: ₹299 → 250 credits, ₹799 → 750 credits (never expire; monthly credits do).
Annual: ₹5,990 / ₹14,990 / ₹39,990 (two months free).

Margins above assume every credit is burned. Real burn is 55–70%, so expect **75–85%**
gross margin. Subtract ₹51/user/month of fixed cost.

**Desktop unlimited export** is the sharpest lever you have: rendering happens on the
user's machine, so it costs you nothing and no browser-based competitor can match it.
Put it on every paid tier.

## 8. Cut COGS before launch

| Change | Saving | Applies to | Effort |
|---|---|---|---|
| Photo analysis → `gpt-4o-mini` (`analyze-image.ts` uses `visionModel`) | **₹4.45** | clean run | one line in `src/lib/ai/client.ts` |
| AI auto-edit → Gemini 2.5 Flash primary, GPT-4o fallback | **₹2.18** | clean run | mirror the pattern in `generate-script/route.ts` |
| Remove the duplicate TTS normalisation — `synthesize-voiceover.ts` Phase 1 **and** `google-cloud-tts.ts` `sanitizeAndNormalizeTextForTTS` both run for non-English | ₹0.08 + a round-trip of latency | clean run | delete one |
| Cache TTS on `hash(script + voice + style)` | ₹1.73 | **rework only** | new cache table + R2 key |
| Subtitle translate → Gemini primary | ₹0.88 | **not in the reference video** | fallback already written |

Scope matters: TTS caching only pays back when a user regenerates, and subtitle translate
isn't part of the reference video at all — subtracting either from the clean-run baseline
would overstate the gain.

The three clean-run changes take COGS from **₹13.08 → ₹6.38** per video, turning the credit
multiplier into **7.8×** at identical retail prices.

## 9. Implementation plan

### Schema

`User.creditsUsed` / `creditsLimit` are read in `api/me`, `api/dashboard/stats`,
`api/analytics`, and three dashboard pages — but **never written**. Keep them as
denormalised display fields; make an append-only ledger the source of truth.

```prisma
model CreditLedger {
  id             String   @id @default(cuid())
  userId         String
  delta          Int      // negative = spend, positive = grant/refund
  balanceAfter   Int
  operation      String   // "voiceover" | "script_pack" | "export" | ...
  projectId      String?
  idempotencyKey String   @unique
  status         LedgerStatus @default(RESERVED) // RESERVED → COMMITTED | REFUNDED
  metadata       Json?    // { seconds, photoCount, model, promptTokens, ... }
  createdAt      DateTime @default(now())
  @@index([userId, createdAt])
}

model Subscription {
  id                  String   @id @default(cuid())
  userId              String   @unique
  plan                Plan
  razorpaySubId       String?  @unique
  razorpayCustomerId  String?
  status              String   // active | past_due | cancelled
  currentPeriodEnd    DateTime
  creditsGrantedAt    DateTime
}

model UsageEvent {  // raw provider metering — validates the 3.8x multiplier
  id           String   @id @default(cuid())
  userId       String
  operation    String
  provider     String   // "openai" | "gemini" | "render"
  model        String?
  inputTokens  Int?
  outputTokens Int?
  audioSeconds Float?
  costUsd      Decimal  @db.Decimal(10, 6)
  createdAt    DateTime @default(now())
}
```

### Charging rules

1. **Reserve → commit → refund.** Write a `RESERVED` ledger row before the provider
   call, flip to `COMMITTED` on success, `REFUNDED` on any failure. A user never pays
   for a 500.
2. **Idempotency key** = `hash(userId + operation + projectId + inputHash)`. A retried
   request reuses the existing row instead of double-charging. This matters because
   `generate-voiceover` and `export` are the routes users hammer.
3. **Balance check inside the same transaction** as the reservation — otherwise two
   concurrent exports both pass the check at zero balance.
4. **Free-on-repeat**: identical `hash(script + voice + style)` returns the cached audio
   at 0 credits. Same for re-downloading an existing `ExportJob`.
5. **Meter everything, charge for some.** Write a `UsageEvent` even for free operations,
   so after 30 days you can compare real COGS against the credit table and re-price.

### Enforcement points

Wrap these routes; everything else stays free:

```
api/projects/[id]/generate-script      → 4
api/projects/[id]/refine-script        → 1
api/projects/[id]/extract              → 2
api/projects/[id]/media/analyze        → 1 × photoCount
api/projects/[id]/media/[mediaId]/analyze → 1
api/projects/[id]/timeline/generate    → 10
api/projects/[id]/generate-voiceover   → ceil(seconds / 15) × 3
api/projects/[id]/tts                  → ceil(seconds / 15) × 3
api/tts/preview                        → 1
api/projects/[id]/subtitles/generate   → 1
api/projects/[id]/subtitles/translate  → 4
api/projects/[id]/generate-social      → 2
api/projects/[id]/titles               → 2
api/projects/[id]/export               → 8 (web) / 0 (DESKTOP_MODE)
```

Gate desktop exports on `process.env.DESKTOP_MODE` — that path already exists for the
auth bypass, and the WASM/native compositor means there is no server cost to recover.

### Abuse guards

- Max 10 voiceover generations per project per day.
- Max 1 concurrent export on Starter, 3 on Pro, 8 on Studio.
- Cap the relay (`RELAY_DAILY_LIMIT`, already implemented) per plan rather than a flat 300.
- Free plan: no API relay access, 720p only, watermark burned in.

### Payments

Razorpay Subscriptions for India (UPI, cards, netbanking) + Stripe later for
international. Webhook (`api/webhooks/razorpay`) handles `subscription.charged` →
grant credits, `subscription.halted` → downgrade to Free at period end. Reuse the
signature-verification pattern from `api/webhooks/clerk`. Store every webhook event
with its Razorpay event id and process idempotently — Razorpay retries.

You need a GST-compliant invoice per charge (your GSTIN, HSN/SAC `998314`, customer
state code, split CGST/SGST vs IGST). Razorpay Invoices can generate these; don't
hand-roll it.

## 10. The user-facing surface

The customer never sees §2. They see one price per button. Internal fan-out —
normalisation, TTS, STT alignment, retries, fallbacks — is invisible and included.

### Every action that costs credits

| Button | Where | What the user reads | Credits |
|---|---|---|---|
| Extract facts | Details tab | "Read the listing and pull out the facts" | **2** |
| Generate scripts / Generate new batch | Scripts tab | "Write 3 script options" | **4** |
| Refine with AI | Scripts tab | "Rewrite this script with your notes" | **1** |
| Analyze (per photo) | Media tab | "Tag this photo for auto-editing" | **1** |
| Analyze all | Media tab | "Tag 15 photos" | **1 each — 15** |
| Preview sample | Voiceover panel | "Hear this voice before committing" | **1** |
| Generate voiceover | Voiceover panel | "Narrate the script — 45s" | **3 per 15s → 9** |
| AI auto-edit | Timeline editor panel | "Build the timeline from your photos + script" | **10** |
| Translate subtitles | Subtitle Studio | "Translate captions to another language" | **4** |
| Re-time subtitles | Subtitle Studio | "Re-sync captions to the audio" | **1** |
| Generate content pack | Social tab | "Instagram, Facebook and WhatsApp captions" | **2** |
| Export | Editor top nav (web) | "Render 1080p MP4" | **8** |
| Export | **Desktop app** | "Renders on your PC" | **0 — unlimited** |

### Every action that is free — say this loudly

Uploading photos and video · every timeline edit, trim, transition, text overlay, Ken
Burns · playback and preview scrubbing · saving and autosave · Kannada transliteration
typing · font and sound-effect search · brand kit · duplicating a project ·
re-downloading a video you already exported · publishing to social · **any action that
fails**.

The last one matters most. A failed generation refunds automatically, and users need to
know that before they trust the meter.

### The three numbers on the pricing page

1. **1 credit ≈ ₹1** — so a price is legible without conversion.
2. **A finished video ≈ 50 credits** — the only anchor that matters.
3. **Pro = ₹1,499 for ~30 videos** — i.e. ₹50 a video, versus ₹3,000+ for a freelance editor.

### Worked example — Pro user, 1,600 credits

| Step | Credits | Balance |
|---|---|---|
| Start of month | | 1,600 |
| Paste listing → Extract facts | −2 | 1,598 |
| Generate scripts (3 options) | −4 | 1,594 |
| Didn't like them → Generate new batch | −4 | 1,590 |
| Refine the winner | −1 | 1,589 |
| Upload 15 photos → Analyze all | −15 | 1,574 |
| Preview 3 voices | −3 | 1,571 |
| Generate voiceover (45s) | −9 | 1,562 |
| AI auto-edit | −10 | 1,552 |
| Manual polish in the editor | 0 | 1,552 |
| Re-time subtitles | −1 | 1,551 |
| Export 1080p | −8 | 1,543 |
| Export again after a fix | −8 | 1,535 |
| Content pack for Instagram | −2 | 1,533 |
| **One video, with real back-and-forth** | **−67** | |

~21 videos a month at that rate, ~32 for a user who gets it right first time. Sets the
Pro credit grant honestly.

> The live model is `costing.xlsx` at the repo root — every number in this document is a
> formula there, driven by the assumption cells on the first sheet.

### UI requirements

**Price on the button, before the click.** `Generate voiceover · 9 cr`. Never a
surprise. For variable costs, compute live — the voiceover button reads the script
length and shows the real number; Analyze all shows `· 15 cr` for 15 photos.

**Confirm anything over 10 credits.** A modal for AI auto-edit and bulk photo analysis:
"This will use 15 credits. You have 1,574." Nothing under 10 needs a dialog.

**Receipt toast on completion.** "Voiceover ready · 9 credits used · 1,562 left."

**Persistent balance** in the top nav, clickable through to history. The dashboard
already renders `creditsUsed / creditsLimit` in three places — repoint those at the
ledger balance.

**A real history page** in Settings: date, action, project, credits, running balance.
Refunds shown as their own green rows, so a failed generation visibly returns.

**Low balance at 15%**: inline banner, not a modal. At zero, paid buttons disable with
"Out of credits — top up ₹299 for 250" rather than failing on click.

**Never charge twice for the same thing.** Regenerating a voiceover from an unchanged
script + voice + style returns the cached audio at 0 credits, and the button says so:
"Already generated — free". This is the single biggest goodwill lever, because
regeneration is where users fear the meter most.
