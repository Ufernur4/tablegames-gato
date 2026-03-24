

# Verification & Remaining Fixes

## Current Status (from code inspection)

**Sidebar tabs**: ✅ Already fixed — all 9 tabs render correctly, quickbar shows all tabs, mobile overlay has close button and backdrop-click.

**Pool Matter.js physics**: ✅ Already implemented — `Pool.tsx` uses `Matter.Engine`, `Matter.Bodies.circle` for balls, cushion walls, pocket detection, drag-to-shoot with power meter.

**Bot game creation**: The "Bot request timeout" error was from a previous version. The current code does a direct Supabase insert without timeout wrapper. If still failing, likely a network/RLS issue.

## Plan — Remaining Items

### Step 1: Remove stale timeout on game creation
**File: `src/components/Lobby.tsx` (lines 104-111)**

The 12-second `creating` timeout still exists and can wrongly cancel a slow bot creation. Remove this defensive timeout — the `try/catch/finally` in `handleCreateBot` already handles errors.

### Step 2: Remove unused `withTimeout` from useBot
**File: `src/hooks/useBot.ts` (lines 13-26)**

The `withTimeout` function and `BOT_REQUEST_TIMEOUT_MS` constant are unused. Remove dead code for clarity.

### Step 3: Fix ref warnings on ShopPanel and FriendsPanel
**Files: `src/components/ShopPanel.tsx`, `src/components/FriendsPanel.tsx`**

Console warnings: "Function components cannot be given refs." These components need `React.forwardRef` if they're receiving refs, or the parent needs to stop passing refs.

### Step 4: Add RLS policy check for bot game insert
Verify that the `games` table RLS policies allow inserting rows where `player_o` is the bot UUID (`00000000-0000-0000-0000-000000000000`). If RLS blocks the insert, add a policy allowing authenticated users to insert games they create.

## Technical Details

- Remove lines 104-111 in Lobby.tsx (the `useEffect` with 12s timeout on `creating`)
- Remove lines 13-26 in useBot.ts (`BOT_REQUEST_TIMEOUT_MS` and `withTimeout`)
- Check RLS with: `SELECT * FROM pg_policies WHERE tablename = 'games'`
- If no insert policy exists, create one allowing `auth.uid() = created_by`

## Expected Outcome
- Bot games create instantly without false timeout errors
- Sidebar continues working on all 9 tabs
- Pool physics remain functional with Matter.js collisions
- Clean console without ref warnings

