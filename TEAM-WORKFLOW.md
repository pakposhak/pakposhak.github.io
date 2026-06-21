# PakPoshak — two-folder workflow (so edits never collide)

**Why this exists:** this one GitHub repo is checked out in **3 folders at once** (git "worktrees").
On 2026-06-19 a `git commit -a` in one folder swept the other folder's half-finished edits into a
commit and pushed a **broken page live**. These rules prevent that.

## The folders (worktrees) — now just 2 (cleaned up 2026-06-19)
| Folder | Branch | Who | Use for |
|---|---|---|---|
| `…\Documents\Claude\Projects\psb-clean` | `main` | **Danish** | your own quick fixes; commit + push from here |
| `…\Documents\Claude\Projects\Lawn Busines For Bangladesh` | feature branches (e.g. `feat/landing-view4`) | **Claude** | Claude builds here, then fast-forwards to `main` |

(The stale `pakiposhak-category-wt` worktree was removed on 2026-06-19. Its branch `feat/category-system` @ `18fb006` still exists if ever needed; its untracked `VIDEO-GUIDE-script-EN-BN.md` was preserved into the Lawn folder.)

GitHub Pages serves **`index.html`** from `main`. `index.html` and `order-form.html` must stay byte-identical.

## The 4 rules
1. **Never `git commit -a`, `git add .`, or `git add -A`.** Always stage the exact files: `git add index.html order-form.html`. (The `-a`/`.` forms grab whatever the *other* folder left modified — that's the bug that broke the live site.)
2. **One person edits at a time.** If you're about to edit in `psb-clean`, don't ask Claude to edit simultaneously, and vice-versa. Say "I'm done" before handing over.
3. **After ANY push to `main`, the OTHER folder syncs before doing more:**
   - In `psb-clean`: `git pull --ff-only` (run `git stash` first if you have unsaved work, then `git stash pop` after).
   - Claude (in the Lawn Business folder): `git fetch && git rebase origin/main` onto its feature branch.
4. **Claude commits its work promptly** (small commits) so there's nothing loose for a stray `commit -a` to sweep.

## Restore points (if `main` ever breaks again)
- `stable-landing-pre-view4-20260619` — clean build 19c, before the View 4 redesign.
  Roll back with: `git push origin stable-landing-pre-view4-20260619^{commit}:main`
- `backup/landing-pre-view4-20260619` — same snapshot as a branch.

## Right now (2026-06-19) — all clean ✅
- Live `main` = `da1256d`, build `19g` (View 4 landing, products peek into first view). Consistent (index == order-form).
- `psb-clean` synced to `da1256d` (its stale 19c snapshot was just the old version — no work lost).
- Both worktrees on `da1256d`; stale category worktree removed.
