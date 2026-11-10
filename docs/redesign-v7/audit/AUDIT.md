# Night glass audit: every screen (9 Nov 2026)

Pictures taken at iPhone size 390x844 (2x) against the dev server. AI and sync calls were faked the same way the e2e tests fake them, and every outside request was blocked. All pictures are in this folder.
Reference look: `../glass-B-1..4*.png` (approved) and `../built-*.png` (built Feed).

**Result: 11 NEW · 18 OLD · 1 MIXED (30 screens).** Only the Feed and its sheet use Night glass. Everything on Ask and Me, and everything behind them, is still the light design: a cream page (`#fbfaf8`), white cards with beige borders, a cobalt or teal accent, serif headings, and a white tab bar.

How each screen was judged: by looking at the picture, and also by reading the colours the browser actually drew (page background and tab-bar background). Pictures 34, 35, 46, 48, 55 and 56 were judged from those colours plus the screens around them.

## Screen table

| # | Screen | Picture file(s) | Verdict | What's wrong / different | Files involved |
|---|---|---|---|---|---|
| 1 | Feed: Mix | 01-feed-mix.png, 53-first-run-no-flag.png | NEW | Matches glass-B. | FeedScreen.tsx, ModuleCardView.tsx, ChipRow.tsx; glass.css, glass-feed.css |
| 2 | Feed: Words | 02-feed-words.png | NEW | Matches glass-B-1. | same |
| 3 | Feed: Small talk | 03-feed-smalltalk.png | NEW | Matches glass-B-2. | same |
| 4 | Feed: Say it better | 04-feed-better.png | NEW | Matches glass-B-3. | same |
| 5 | Feed: Office phrases | 05-feed-phrases.png | NEW | Purple glass. Fine. | same |
| 6 | Feed: Stories | 06-feed-stories.png | NEW | Blue glass. Large empty band under the hint pill. The hint starts with a lower-case letter ("start with what you wanted…"). | same |
| 7 | Feed: slide 2 / quick check | 07-feed-words-slide2.png, 08-feed-words-lastslide.png | NEW | Fine. | same |
| 8 | Feed: Sunday review bar | 09-feed-sunday-review.png | NEW | Fine. Glass pills "Knew it / Not yet". | ReviewBar.tsx; glass-feed.css |
| 9 | Feedback sheet 👍👎💬 | 10-feedback-sheet-open.png, 11-feedback-sheet-gotit.png | NEW | Matches glass-B-4. Minor: the reason chips stop with a hard cut at the right edge ("Wrong Englisl"), with no fade. | FeedbackSheet.tsx; glass-feed.css |
| 10 | Feed after ♡ save | 12-feed-after-save.png | NEW | Fine. | ModuleCardView.tsx; glass.css |
| 11 | Tab bar on Feed | 50-tabbar-feed.png | NEW | Floating glass pill. | TabBar.tsx; glass.css (lines 638-680) |
| 12 | Ask: empty | 13-ask-empty.png, 14-ask-empty-full.png | OLD | Cream page. Big cobalt "Ask anything" title. White input box and white chips. **Four coloured picture tiles** (red, blue, yellow, teal) with paper-cut ring art, which is leftover picture art. Grey "Recent asks". | AskScreen.tsx (`RING_ART` img); ask.css; features/cards/art.ts |
| 13 | Ask: typing (library hits) | 15-ask-typing-library.png | OLD | White hit cards with beige borders. Cobalt focus ring and send button. | AskScreen.tsx; ask.css |
| 14 | Ask: answer | 16-ask-answer.png, 17-ask-answer-full.png, 18-ask-answer-added.png | OLD | The answer is in a **serif font** while the rest is sans. White cards with light-blue borders. A small "abc" emoji in the card meta line. | AskAnswer.tsx; ask.css |
| 15 | Ask: chip picked | 19-ask-chip-picked.png | OLD | Same as 12. | AskScreen.tsx; ask.css |
| 16 | Ask: AI down | 54-ask-ai-down.png | OLD | Peach box with a rust left border. It says "Here's what's already in your library" but **no library list appears** under it. | AskScreen.tsx, features/ask/useAsk; ask.css |
| 17 | Skill page (Ask → tile) | 20-skill-page.png, 21-skill-page-full.png | OLD | Teal serif title with an emoji. White ladder card. Mint lesson rows. Grey locked levels. | SkillPage.tsx; lessons.css |
| 18 | Lesson / story player | 22-lesson-player-1.png, 23-lesson-player-2.png, 24-lesson-player-later.png | OLD | Full-screen flat **orange-red** poster. **Large paper-cut illustrations fill half of every slide** (leftover picture art; pictures were dropped in v7). White "Tap to continue" pill. No glass. | LessonPlayer.tsx, cards/PosterCard.tsx; lessons.css, poster.css; public/art/* |
| 19 | Me: home | 25-me-home.png, 26-me-home-full.png, 39-me-home-filled.png | OLD | Cream page. Serif "Me" title. Three white stat boxes; the **serif zeros look like the letter "o"**. White rows with pastel emoji squares (⭐ ⚠️ 📓 🎙️ 💬). The sun/gear icon is black-on-cream. | MeScreen.tsx; me.css |
| 20 | Me: backup / sign-in | 27-me-backup-signin.png | OLD | White card, grey inputs, pale-blue "Sign in" pill (it stays disabled until a password is typed too, which is expected). | BackupRow.tsx; me.css |
| 21 | Me: Saved / My weak spots / Things I asked | 28-me-saved-tapped.png, 29-me-weak-tapped.png, 30-me-asked-tapped.png | OLD + **BROKEN** | These rows show a ">" arrow, but **tapping them does nothing**: App.tsx never passes `onOpenRow`, so the tap goes nowhere. | MeScreen.tsx, App.tsx; me.css |
| 22 | Me: What the app learned + What the app knows | 31-me-learned-memory.png | OLD | White cards, beige inner box, white "Remove" pill. | LearnedFromYou.tsx, LearnerMemory.tsx; me.css |
| 23 | Me: Story bank | 32-me-story-bank.png, 41-me-story-bank-filled.png | OLD | Light list, "← Back to Me" text link, serif title. | MeScreen.tsx; me.css + chat.css (`chat-back`, `chat-list*`) |
| 24 | Me: Evening chats list | 33-me-evening-chats.png, 40-me-evening-chats-filled.png | OLD | Same as 23, plus a black "Start tonight's chat" button. | MeScreen.tsx; me.css + chat.css |
| 25 | Evening chat (question, recording, feedback, done) | 34-chat-question.png, 35-chat-recording.png, 36-chat-feedback.png, 37-chat-feedback-full.png, 38-chat-done.png | OLD | Cream page, serif "Evening chat", white and black bubbles, white number tiles. Green "Good" text. **Orange-rust fix text** ("→ Say 'I sent the file'…"), which is close to the no-red rule. Black "Next question" and "Done" buttons. On first view, Say it again / Next question sit right on top of the tab bar. | EveningChat.tsx; chat.css |
| 26 | Old tools menu (gear on Me) | 42-oldtools-menu.png | OLD | White header bar, white rows. Covers the whole screen, including the tab bar. | OldToolsSheet.tsx; me.css (`.old-tools*`) |
| 27 | Old tools → Browse (+ deck, + card) | 43-oldtools-browse.png, 44-oldtools-browse-lower.png, 49-oldtools-browse-open.png, 56-oldtools-browse-deck-modal.png, 57-oldtools-browse-card-detail.png | OLD | v4 deck grid with emoji. **"Practical Hindi" deck (100 cards) is listed**, and its flag icon shows as plain "IN". The card view is a v4 white card with a serif title. No Devanagari script appears on any screen. | BrowseScreen.tsx, DeckModal.tsx, CardDetailSheet.tsx, CardFace.tsx; browse.css, modal.css, cards.css |
| 28 | Old tools → Speak & voice lab | 45-oldtools-speak.png, 46-oldtools-speak-lower.png | OLD | v4 Speak screen. **The text sits flush on the blue Start button, and Start sits flush on the routine card (no gap).** | SpeakScreen.tsx + modes/*; speak.css |
| 29 | Old tools → Old You (+ coach) | 47-oldtools-you.png, 48-oldtools-you-lower.png, 55-oldtools-you-coachbox.png | OLD | v4 You screen: serif zeros, a blue "Loudness" chip, a red bookmark emoji. | YouScreen.tsx, you/*, features/coach/CoachBox.tsx; you.css, capture.css |
| 30 | Tab bar on Ask and Me | 51-tabbar-ask.png, 52-tabbar-me.png | **MIXED** | The tab bar switches look by tab. On Feed it is a glass pill. On Ask and Me it is a white full-width bar with a cobalt active icon. The glass rules only apply when `.v7-feed` is on screen (`.v5-shell:has(.v7-feed) .v5-tabs`). | TabBar.tsx; glass.css 638-680, base.css 171-200 |

### Other findings
- **Onboarding is never shown.** `FirstRun.tsx` is not mounted anywhere. With the first-run flag cleared, the app opens straight on the Feed (53), so `onboarding.css` is effectively dead.
- **Page base is still light.** `tokens.css` sets `body` to cream (`#fbfaf8`). The dark background only exists inside `.v7-feed`, so any screen outside the Feed falls back to cream.
- **Leftover picture art.** It is in two places: the Ask skill tiles (`RING_ART`, `/art/ring-*.webp`) and the lesson player (PosterCard art, `/art/*-mindset-*.webp`).
- **Red text:** none in true red. The near-red cases are the rust/orange fix line in the evening chat (36) and the rust border on the Ask AI-down note (54).
- **Hindi:** no Devanagari script anywhere. The only Hindi is the "Practical Hindi" deck in Old tools → Browse.
- **Layout:** no screen scrolls sideways at 390 px.

## Proposed split (for parallel build later)

Each piece owns its files and no other piece touches them. P0 goes first because it is the shared base; then P1–P4 can run side by side. P5 is optional.

| Piece | What | Files it owns (only these) | Size |
|---|---|---|---|
| **P0 Base (first, one owner)** | Dark night page background everywhere. Glass tab bar on every tab (drop the `:has(.v7-feed)` scope). A small shared set of glass page classes (page, title, panel, row, button, input, chip) for P1–P5 to use. Move the `.old-tools*` rules out of me.css into their own file so P3 and P5 stay separate. | tokens.css, base.css, glass.css (tab-bar block only), **new** glass-ui.css, index.css, **new** old-tools.css (moved from me.css), me.css (removal of the `.old-tools*` block only) | S |
| **P1 Ask** | Restyle Ask: empty, typing, answer, AI-down. Replace the picture tiles with glass tiles (no art). Sans answer text. Fix the empty "library" promise on AI-down. | ask.css, AskScreen.tsx, AskAnswer.tsx | M |
| **P2 Skill page + lesson player** | Glass skill ladder. Lesson player on a glass module background, with no illustrations (needs his yes on dropping pictures here too). | lessons.css, poster.css, SkillPage.tsx, LessonPlayer.tsx, PosterCard.tsx | M |
| **P3 Me home** | Glass stats, backup/sign-in, rows, learned/knows panels; sans numbers. Wire Saved / Weak spots / Things I asked to real pages (a behaviour change, so it needs his decision). | me.css (after P0), MeScreen.tsx, BackupRow.tsx, LearnedFromYou.tsx, LearnerMemory.tsx, App.tsx (only if the rows are wired) | M |
| **P4 Evening chat + Me lists** | Glass chat bubbles, tiles, feedback boxes (no rust text), done screen. Also the Story bank / Evening chats lists, because their `chat-back` / `chat-list*` classes live in chat.css. | chat.css, EveningChat.tsx | M |
| **P5 Old tools (optional, last)** | Restyle or simply leave as "old". About 2,200 lines of v4 CSS. Also hide or remove the Practical Hindi deck. | old-tools.css, OldToolsSheet.tsx, browse.css, modal.css, cards.css, speak.css, you.css, capture.css, browse/*, speak/*, you/*, cards/CardFace.tsx, CardDetailSheet.tsx, features/coach/CoachBox.tsx | L |

Notes for the split:
- Leave `feed.css` alone. It still holds `.poster-slide` touch rules, but no restyle piece needs it.
- `ask-tile` rules appear in both ask.css and lessons.css. P1 owns ask.css and P2 owns lessons.css; P2 must not change `.ask-tile*`.
- Decisions to get from Adarsh before building: (1) drop the pictures from the lesson player and the Ask tiles? (2) wire the three dead Me rows now? (3) restyle Old tools, or leave it as-is behind the gear?
