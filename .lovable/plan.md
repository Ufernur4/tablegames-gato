
# Fix: Mobile Sidebar Tabs Not Switching + Layout Issues

## Problem Summary
Testing on mobile (375x812) revealed these critical bugs:

1. **Sidebar tabs don't switch content** — Clicking any tab (Freunde, Ranking, Shop, etc.) always shows "LOBBY CHAT" content
2. **Sidebar overlay covers entire screen** — Once opened, it's hard to close; the backdrop click handler doesn't work properly
3. **Quickbar only shows 7/9 tabs** — Mod and Profil tabs are cut off from the bottom navigation
4. **Sidebar height too small** — The content area uses `h-64` on mobile which is only ~256px

## Root Cause Analysis
The sidebar uses `fixed inset-0` on mobile with a backdrop overlay. The content renders inside a `relative z-10` div, but the layout structure causes these issues:

- The `aside` element renders after `main` in the DOM, and the backdrop `div` inside the aside captures clicks
- The content area's `h-64` constrains the visible area unnecessarily on mobile
- The quickbar `slice(0, 7)` intentionally cuts off the last 2 tabs

## Plan

### Step 1: Fix sidebar mobile layout
**File: `src/components/Lobby.tsx`**

Restructure the mobile sidebar to be a proper full-screen overlay panel:
- Remove `h-64` constraint → use `h-full` for the content area on mobile
- Fix the backdrop click handler so it properly closes the sidebar
- Make the sidebar content div take the full available height minus the tab strip
- Add a close button (X) at the top of the sidebar for easy dismissal

### Step 2: Show all 9 tabs in quickbar
**File: `src/components/Lobby.tsx`**

Change the quickbar from `sidebarTabs.slice(0, 7)` to show all tabs. Use scrollable horizontal layout or reduce icon/text size to fit all 9 tabs:
- Remove the `.slice(0, 7)` call
- Make the quickbar horizontally scrollable if needed
- Ensure Mod and Profil tabs are accessible

### Step 3: Ensure tab content renders correctly
**File: `src/components/Lobby.tsx`**

The conditional rendering logic (`sidebarTab === 'chat' && ...`) is correct in code, but the sidebar structure may cause stale rendering. Fix:
- Ensure the sidebar content container properly unmounts/remounts when tab changes
- Remove `overflow-hidden` that may clip non-chat content
- Set proper scrollable containers for each tab's content

### Technical Details

**Sidebar structure fix (lines 435-465):**
```
aside (fixed inset-0, z-30 on mobile)
  └─ backdrop div (absolute inset-0, onClick close) ← fix z-index
  └─ content div (relative z-10, flex-col h-full) ← fix height
       └─ tab strip (scrollable)
       └─ content area (flex-1, overflow-y-auto) ← remove h-64
```

**Quickbar fix (line 469):**
- Change `sidebarTabs.slice(0, 7)` → `sidebarTabs` with smaller styling

### Expected Outcome
- All 9 sidebar tabs accessible and switching correctly on mobile
- Sidebar opens/closes properly with backdrop click
- Each tab (Chat, Freunde, Ranking, Erfolge, Shop, Bonus, VIP, Mod, Profil) renders its correct content
