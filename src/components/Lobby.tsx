import { useState, useEffect, useCallback } from 'react';
import { useGames, type Game } from '@/hooks/useGames';
import { createBotGame, type BotDifficulty } from '@/hooks/useBot';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ChatPanel } from '@/components/ChatPanel';
import { FriendsPanel } from '@/components/FriendsPanel';
import { ProfilePanel } from '@/components/ProfilePanel';
import { AchievementsPanel } from '@/components/AchievementsPanel';
import { LeaderboardPanel } from '@/components/LeaderboardPanel';
import { ShopPanel } from '@/components/ShopPanel';
import { BonusCodePanel } from '@/components/BonusCodePanel';
import { PremiumPanel } from '@/components/PremiumPanel';
import { ModerationPanel } from '@/components/ModerationPanel';
import { sounds, isSoundEnabled, toggleSound } from '@/lib/sounds';
import { t, getLang, setLang, LANGUAGES, type Lang } from '@/lib/i18n';
import { motion, AnimatePresence } from 'framer-motion';
import {
  RefreshCw, Grid3X3, Target, LogOut, Users, Loader2, Search,
  User, MessageSquare, UserPlus, Cpu, Circle, Crosshair, Bot,
  ShoppingBag, Dices, Flag, HelpCircle, Type, Crown, Gamepad2,
  Brain, Hand, Sparkles, Volume2, VolumeX, Trophy, Star,
  Gift, Download, Zap, Link2, ChevronRight, Swords, Shield,
} from 'lucide-react';

const GAME_TYPES = [
  { id: 'tic-tac-toe' as const, label: 'Tic-Tac-Toe', icon: Grid3X3, emoji: '❌', color: 'from-rose-500/20 to-orange-500/20' },
  { id: 'connect-four' as const, label: 'Vier Gewinnt', icon: Circle, emoji: '🔴', color: 'from-red-500/20 to-yellow-500/20' },
  { id: 'chess' as const, label: 'Schach', icon: Crown, emoji: '♔', color: 'from-amber-500/20 to-yellow-500/20' },
  { id: 'checkers' as const, label: 'Dame', icon: Cpu, emoji: '⬛', color: 'from-slate-500/20 to-stone-500/20' },
  { id: 'ludo' as const, label: 'Ludo', icon: Dices, emoji: '🎲', color: 'from-blue-500/20 to-purple-500/20' },
  { id: 'darts' as const, label: 'Darts', icon: Target, emoji: '🎯', color: 'from-emerald-500/20 to-teal-500/20' },
  { id: 'battleship' as const, label: 'Schiffe', icon: Crosshair, emoji: '🚢', color: 'from-cyan-500/20 to-blue-500/20' },
  { id: 'bowling' as const, label: 'Bowling', icon: Dices, emoji: '🎳', color: 'from-orange-500/20 to-red-500/20' },
  { id: 'mini-golf' as const, label: 'Mini Golf', icon: Flag, emoji: '⛳', color: 'from-green-500/20 to-emerald-500/20' },
  { id: 'pool' as const, label: '8-Ball', icon: Circle, emoji: '🎱', color: 'from-indigo-500/20 to-violet-500/20' },
  { id: 'trivia' as const, label: 'Trivia', icon: HelpCircle, emoji: '🧠', color: 'from-purple-500/20 to-pink-500/20' },
  { id: 'word-game' as const, label: 'Wortspiel', icon: Type, emoji: '📝', color: 'from-teal-500/20 to-cyan-500/20' },
  { id: 'memory' as const, label: 'Memory', icon: Brain, emoji: '🧩', color: 'from-pink-500/20 to-rose-500/20' },
  { id: 'rock-paper-scissors' as const, label: 'Schere Stein Papier', icon: Hand, emoji: '✊', color: 'from-violet-500/20 to-purple-500/20' },
  { id: 'table-soccer' as const, label: 'Tischfußball', icon: Gamepad2, emoji: '⚽', color: 'from-green-500/20 to-lime-500/20' },
] as const;

type GameTypeId = typeof GAME_TYPES[number]['id'];

interface LobbyProps {
  userId: string;
  displayName: string;
  onJoinGame: (game: Game, botDifficulty?: BotDifficulty) => void;
  onSignOut: () => void;
}

type SidebarTab = 'chat' | 'friends' | 'profile' | 'shop' | 'achievements' | 'leaderboard' | 'bonus' | 'premium' | 'moderation';

function useKonamiCode(callback: () => void) {
  useEffect(() => {
    const code = ['ArrowUp','ArrowUp','ArrowDown','ArrowDown','ArrowLeft','ArrowRight','ArrowLeft','ArrowRight','b','a'];
    let idx = 0;
    const handler = (e: KeyboardEvent) => {
      if (e.key === code[idx]) { idx++; if (idx === code.length) { callback(); idx = 0; } } else { idx = 0; }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [callback]);
}

function useInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      if (!localStorage.getItem('xplay-pwa-dismissed')) setShowBanner(true);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const install = async () => {
    if (deferredPrompt) { deferredPrompt.prompt(); await deferredPrompt.userChoice; setDeferredPrompt(null); setShowBanner(false); }
  };
  const dismiss = () => { setShowBanner(false); localStorage.setItem('xplay-pwa-dismissed', '1'); };
  return { showBanner, install, dismiss };
}

export function Lobby({ userId, displayName, onJoinGame, onSignOut }: LobbyProps) {
  const { games, loading, createGame, joinGame, deleteGame } = useGames();
  const [creating, setCreating] = useState(false);
  const [joinId, setJoinId] = useState('');
  const [filter, setFilter] = useState<'all' | 'waiting' | 'playing'>('all');
  const [error, setError] = useState('');
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('chat');
  const [showBotMenu, setShowBotMenu] = useState(false);
  const [selectedBotGame, setSelectedBotGame] = useState<GameTypeId | null>(null);
  const [selectedGameMode, setSelectedGameMode] = useState<GameTypeId | null>(null);
  const [easterEgg, setEasterEgg] = useState(false);
  const [soundOn, setSoundOn] = useState(isSoundEnabled());
  const [lang, setCurrentLang] = useState<Lang>(getLang());
  const [showSidebar, setShowSidebar] = useState(false);
  const { showBanner, install, dismiss } = useInstallPrompt();


  useKonamiCode(useCallback(() => {
    setEasterEgg(true);
    sounds.achievement();
    setTimeout(() => setEasterEgg(false), 5000);
  }, []));

  const filteredGames = games
    .filter(g => filter === 'all' || g.status === filter);

  const handleCreate = async (type: GameTypeId) => {
    setCreating(true); setError(''); sounds.click();
    try {
      const { data, error: err } = await createGame(userId, type as any);
      if (err) { setError(err.message); return; }
      if (data) { sounds.navigate(); onJoinGame(data); }
    } catch { setError('Fehler beim Erstellen.'); }
    finally { setCreating(false); }
  };

  const handleCreateBot = async (type: GameTypeId, difficulty: BotDifficulty) => {
    setCreating(true); setError(''); setShowBotMenu(false); setSelectedBotGame(null); sounds.click();
    try {
      const { data, error: err } = await createBotGame(userId, type as any, difficulty);
      if (err) { console.error('Bot game creation error:', err); setError(typeof err === 'object' && err?.message ? err.message : String(err)); setCreating(false); return; }
      if (data) { sounds.navigate(); onJoinGame(data, difficulty); }
      else { setError('Spiel konnte nicht erstellt werden.'); }
    } catch (e: any) { console.error('Bot game exception:', e); setError(e?.message || 'Fehler beim Erstellen.'); }
    finally { setCreating(false); }
  };

  const handleJoin = async (game: Game) => {
    setError(''); sounds.click();
    try {
      const { error: err } = await joinGame(game.id, userId);
      if (err) { setError(err.message); return; }
      sounds.navigate();
      onJoinGame({ ...game, player_o: userId, status: 'playing' });
    } catch { setError('Fehler beim Beitreten.'); }
  };

  const handleJoinById = async () => {
    if (!joinId.trim()) return;
    const game = games.find(g => g.id === joinId.trim());
    if (!game) { setError('Spiel nicht gefunden.'); sounds.invalid(); return; }
    if (game.status !== 'waiting') { setError('Spiel nicht verfügbar.'); return; }
    await handleJoin(game);
  };

  const getGameLabel = (type: string) => GAME_TYPES.find(t => t.id === type)?.label || type;
  const getGameEmoji = (type: string) => GAME_TYPES.find(t => t.id === type)?.emoji || '🎮';
  const getGameColor = (type: string) => GAME_TYPES.find(t => t.id === type)?.color || 'from-primary/20 to-primary/10';

  const myActiveGames = games.filter(g => (g.player_x === userId || g.player_o === userId) && g.status === 'playing').length;
  const myWins = games.filter(g => g.winner === userId).length;

  const sidebarTabs: { key: SidebarTab; icon: any; label: string }[] = [
    { key: 'chat', icon: MessageSquare, label: 'Chat' },
    { key: 'friends', icon: UserPlus, label: 'Freunde' },
    { key: 'leaderboard', icon: Crown, label: 'Ranking' },
    { key: 'achievements', icon: Trophy, label: 'Erfolge' },
    { key: 'shop', icon: ShoppingBag, label: 'Shop' },
    { key: 'bonus', icon: Gift, label: 'Bonus' },
    { key: 'premium', icon: Zap, label: 'VIP' },
    { key: 'moderation', icon: Shield, label: 'Mod' },
    { key: 'profile', icon: User, label: 'Profil' },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-background bg-orbs relative">
      <AnimatePresence>
        {easterEgg && (
          <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} className="fixed inset-0 pointer-events-none z-50 flex items-center justify-center">
            <div className="text-6xl animate-bounce-soft">🎉🎊🎮🏆✨</div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* PWA Install Banner */}
      <AnimatePresence>
        {showBanner && (
          <motion.div initial={{ y: 100, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 100, opacity: 0 }} className="pwa-install-banner">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center shrink-0 animate-pulse-glow">
                <Download className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground">X-Play installieren</p>
                <p className="text-[10px] text-muted-foreground">Spiele offline & direkt vom Homescreen</p>
              </div>
              <div className="flex gap-1.5 shrink-0">
                <Button size="sm" onClick={install} className="text-xs h-7 gap-1 btn-neon"><Download className="w-3 h-3" /> App</Button>
                <Button size="sm" variant="ghost" onClick={dismiss} className="text-xs h-7 text-muted-foreground">✕</Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <header className="border-b border-border px-4 py-2.5 flex items-center justify-between glass sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <motion.h1 whileHover={{ scale: 1.03 }} className="text-lg font-extrabold tracking-tight flex items-center gap-1.5">
            <Gamepad2 className="w-5 h-5 text-primary" />
            <span className="gradient-text">X-Play</span>
          </motion.h1>
          <div className="hidden sm:flex items-center gap-2">
            <span className="text-xs text-muted-foreground glass-card px-2.5 py-1">{displayName}</span>
            {myActiveGames > 0 && (
              <span className="text-[10px] bg-primary/10 text-primary rounded-full px-2 py-0.5 flex items-center gap-1 glow-primary-sm">
                <Sparkles className="w-3 h-3" /> {myActiveGames}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          {myWins > 0 && (
            <span className="text-[10px] text-primary flex items-center gap-0.5 mr-1 streak-glow font-semibold">
              <Trophy className="w-3 h-3" /> {myWins}
            </span>
          )}
          <select
            value={lang}
            onChange={e => { const l = e.target.value as Lang; setLang(l); setCurrentLang(l); }}
            className="bg-secondary text-foreground text-[10px] rounded-lg px-1.5 py-1 border border-border cursor-pointer"
          >
            {LANGUAGES.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}
          </select>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={() => setSoundOn(toggleSound())}>
            {soundOn ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground lg:hidden" onClick={() => setShowSidebar(!showSidebar)}>
            <MessageSquare className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={onSignOut}>
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      </header>

      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden relative z-10">
        {/* Main Content */}
        <main className="flex-1 overflow-y-auto p-4 pb-24 lg:pb-4 space-y-5">
          {/* Hero Stats */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="grid grid-cols-3 gap-2">
            {[
              { value: games.filter(g => g.status === 'waiting').length, label: 'Offen', icon: '🎮', glow: false },
              { value: games.filter(g => g.status === 'playing').length, label: 'Live', icon: '🔴', glow: true },
              { value: GAME_TYPES.length, label: 'Spiele', icon: '🎯', glow: false },
            ].map(({ value, label, icon, glow }, i) => (
              <motion.div key={label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}
                className={`glass-card p-3 text-center card-3d ${glow ? 'neon-border' : ''}`}>
                <p className="text-2xl font-extrabold tabular-nums text-foreground">{value}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{icon} {label}</p>
              </motion.div>
            ))}
          </motion.div>

          {/* Game Grid - Plato Style */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
                <Swords className="w-4 h-4 text-primary" /> Spiele
              </h2>
            </div>

            {/* Mode selector: vs Spieler or vs Bot */}
            <AnimatePresence>
              {selectedGameMode && !selectedBotGame && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden mb-3">
                  <div className="glass-card p-3 space-y-2">
                    <p className="text-xs font-semibold text-foreground">
                      {getGameEmoji(selectedGameMode)} {getGameLabel(selectedGameMode)} – Wie möchtest du spielen?
                    </p>
                    <div className="flex gap-2">
                      <Button onClick={() => { handleCreate(selectedGameMode); setSelectedGameMode(null); }} disabled={creating} size="sm" className="flex-1 gap-1.5 text-xs h-9">
                        {creating && <Loader2 className="w-3 h-3 animate-spin" />}
                        <Users className="w-3.5 h-3.5" /> vs Spieler
                      </Button>
                      <Button onClick={() => { setSelectedBotGame(selectedGameMode); }} variant="secondary" size="sm" className="flex-1 gap-1.5 text-xs h-9">
                        <Bot className="w-3.5 h-3.5" /> vs Bot
                      </Button>
                    </div>
                    <button onClick={() => setSelectedGameMode(null)} className="text-[10px] text-muted-foreground hover:text-foreground">Abbrechen</button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Bot difficulty selector */}
            <AnimatePresence>
              {selectedBotGame && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden mb-3">
                  <div className="glass-card p-3 flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-muted-foreground">{getGameEmoji(selectedBotGame)} Schwierigkeit:</span>
                    {(['easy', 'medium', 'hard'] as BotDifficulty[]).map(d => (
                      <motion.div key={d} whileTap={{ scale: 0.95 }}>
                        <Button onClick={() => { handleCreateBot(selectedBotGame, d); setSelectedGameMode(null); setSelectedBotGame(null); }} disabled={creating} variant="secondary" size="sm" className="gap-1 text-xs h-7">
                          {creating && <Loader2 className="w-3 h-3 animate-spin" />}
                          {d === 'easy' ? '🟢 Leicht' : d === 'medium' ? '🟡 Mittel' : '🔴 Schwer'}
                        </Button>
                      </motion.div>
                    ))}
                    <Button variant="ghost" size="sm" onClick={() => setSelectedBotGame(null)} className="text-[10px] h-7 text-muted-foreground">← Zurück</Button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
              {GAME_TYPES.map(({ id, label, emoji, color }, i) => (
                <motion.button
                  key={id}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: i * 0.03, type: 'spring', stiffness: 300, damping: 25 }}
                  whileHover={{ scale: 1.04, y: -4 }}
                  whileTap={{ scale: 0.96 }}
                  onClick={() => { setSelectedGameMode(id); setSelectedBotGame(null); sounds.click(); }}
                  disabled={creating}
                  className={`relative flex flex-col items-center gap-2 rounded-2xl bg-gradient-to-br ${color} p-4 text-xs font-semibold text-foreground transition-all disabled:opacity-50 game-card-glow glass-card group ${selectedGameMode === id ? 'ring-2 ring-primary' : ''}`}
                >
                  <span className="text-3xl group-hover:scale-110 transition-transform duration-300">{emoji}</span>
                  <span className="truncate text-[11px]">{label}</span>
                  <ChevronRight className="w-3 h-3 text-muted-foreground absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity" />
                </motion.button>
              ))}
            </div>
          </section>

          {/* Join by ID */}
          <motion.section initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}>
            <h2 className="text-sm font-bold text-foreground mb-2 flex items-center gap-2">🔑 Per ID beitreten</h2>
            <div className="flex gap-2">
              <Input value={joinId} onChange={e => setJoinId(e.target.value)} placeholder="Spiel-ID…" className="bg-secondary/50 border-border text-sm glass-card" />
              <Button onClick={handleJoinById} variant="secondary" size="sm" className="shrink-0">Beitreten</Button>
            </div>
          </motion.section>

          <AnimatePresence>
            {error && (
              <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="rounded-xl bg-destructive/10 border border-destructive/20 p-3 text-xs text-destructive">{error}</motion.div>
            )}
          </AnimatePresence>

          {/* Active Games */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold text-foreground">📋 Spiele</h2>
              <div className="flex gap-1">
                {(['all', 'waiting', 'playing'] as const).map(f => (
                  <button key={f} onClick={() => { setFilter(f); sounds.click(); }}
                    className={`status-badge text-[10px] transition-all cursor-pointer ${filter === f ? 'bg-primary/15 text-primary glow-primary-sm' : 'bg-secondary/50 text-muted-foreground hover:text-foreground'}`}>
                    {f === 'all' ? 'Alle' : f === 'waiting' ? 'Offen' : 'Live'}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              {loading ? (
                <div className="flex justify-center py-12">
                  <div className="relative">
                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                    <div className="absolute inset-0 blur-xl bg-primary/20 rounded-full" />
                  </div>
                </div>
              ) : filteredGames.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Search className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">Keine Spiele gefunden</p>
                  <p className="text-[10px] mt-1">Erstelle ein neues Spiel oben!</p>
                </div>
              ) : (
                filteredGames.map((game, i) => {
                  const isBotGame = game.player_o === '00000000-0000-0000-0000-000000000000';
                  const isMyGame = game.player_x === userId || game.player_o === userId;
                  return (
                    <motion.div key={game.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}
                      className={`game-card flex items-center justify-between gap-3 ${isMyGame ? 'neon-border' : ''}`}>
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${getGameColor(game.game_type)} flex items-center justify-center shrink-0 text-lg`}>
                          {getGameEmoji(game.game_type)}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold text-foreground">{getGameLabel(game.game_type)}</span>
                            {isBotGame && <span className="status-badge bg-neon-cyan/10 text-neon-cyan text-[9px]"><Bot className="w-2.5 h-2.5" /> Bot</span>}
                            <span className={`status-badge text-[9px] ${game.status === 'waiting' ? 'status-waiting' : game.status === 'playing' ? 'status-playing' : 'status-finished'}`}>
                              {game.status === 'waiting' ? 'Offen' : game.status === 'playing' ? 'Live' : 'Beendet'}
                            </span>
                          </div>
                          <span className="text-[10px] text-muted-foreground font-mono">{game.id.slice(0, 8)}…</span>
                        </div>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        {game.status === 'waiting' && game.created_by !== userId && (
                          <Button size="sm" onClick={() => handleJoin(game)} className="h-7 text-xs btn-neon">Beitreten</Button>
                        )}
                        {game.created_by === userId && game.status === 'waiting' && (
                          <>
                            <Button size="sm" variant="ghost" onClick={() => { navigator.clipboard.writeText(`${window.location.origin}?join=${game.id}`); sounds.coinEarn(); }} className="h-7 w-7 p-0 text-muted-foreground" title="Link kopieren">
                              <Link2 className="w-3 h-3" />
                            </Button>
                            <Button size="sm" variant="secondary" onClick={() => onJoinGame(game)} className="h-7 text-xs">Öffnen</Button>
                            <Button size="sm" variant="ghost" onClick={() => deleteGame(game.id)} className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive">✕</Button>
                          </>
                        )}
                        {(game.player_x === userId || game.player_o === userId) && game.status === 'playing' && (
                          <Button size="sm" onClick={() => onJoinGame(game)} className="h-7 text-xs btn-neon gap-1">
                            <Sparkles className="w-3 h-3" /> Play
                          </Button>
                        )}
                      </div>
                    </motion.div>
                  );
                })
              )}
            </div>
          </section>
        </main>

        {/* Sidebar - Desktop always, Mobile toggle */}
        {/* Mobile Sidebar Overlay */}
        {showSidebar && (
          <div className="fixed inset-0 z-30 lg:hidden flex flex-col">
            <div className="absolute inset-0 bg-background/70 backdrop-blur-sm" onClick={() => setShowSidebar(false)} />
            <div className="relative z-10 flex flex-col h-full bg-card mt-12 rounded-t-2xl shadow-2xl">
              <div className="flex items-center justify-between border-b border-border px-3 py-2">
                <div className="flex overflow-x-auto scrollbar-thin gap-0.5 flex-1">
                  {sidebarTabs.map(({ key, icon: Icon, label }) => (
                    <button key={key} onClick={(e) => { e.stopPropagation(); setSidebarTab(key); sounds.click(); }}
                      className={`flex-none px-2 py-1.5 text-[10px] font-medium transition-all whitespace-nowrap rounded-lg ${
                        sidebarTab === key
                          ? 'bg-primary/10 text-primary'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}>
                      <Icon className="w-3.5 h-3.5 inline mr-0.5" />{label}
                    </button>
                  ))}
                </div>
                <button onClick={() => setShowSidebar(false)} className="ml-2 text-muted-foreground hover:text-foreground text-lg shrink-0">✕</button>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto">
                {sidebarTab === 'chat' && <ChatPanel userId={userId} title="Lobby Chat" />}
                {sidebarTab === 'friends' && <FriendsPanel userId={userId} onJoinGame={onJoinGame} />}
                {sidebarTab === 'achievements' && <div className="p-4 overflow-y-auto h-full"><AchievementsPanel userId={userId} /></div>}
                {sidebarTab === 'leaderboard' && <LeaderboardPanel userId={userId} />}
                {sidebarTab === 'shop' && <ShopPanel userId={userId} />}
                {sidebarTab === 'bonus' && <div className="p-4 overflow-y-auto h-full"><BonusCodePanel userId={userId} /></div>}
                {sidebarTab === 'premium' && <div className="p-4 overflow-y-auto h-full"><PremiumPanel /></div>}
                {sidebarTab === 'moderation' && <ModerationPanel userId={userId} />}
                {sidebarTab === 'profile' && <div className="p-4 overflow-y-auto h-full"><ProfilePanel userId={userId} onClose={() => setSidebarTab('chat')} /></div>}
              </div>
            </div>
          </div>
        )}

        {/* Desktop Sidebar */}
        <aside className="hidden lg:flex w-80 border-l border-border flex-col glass">
          <div className="flex border-b border-border overflow-x-auto scrollbar-thin p-1 gap-0.5">
            {sidebarTabs.map(({ key, icon: Icon, label }) => (
              <button key={key} onClick={() => { setSidebarTab(key); sounds.click(); }}
                className={`flex-none px-2 py-2 text-[10px] font-medium transition-all whitespace-nowrap rounded-lg ${
                  sidebarTab === key
                    ? 'bg-primary/10 text-primary glow-primary-sm'
                    : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
                }`}>
                <Icon className="w-3.5 h-3.5 inline mr-0.5" />{label}
              </button>
            ))}
          </div>
          <div className="flex-1 min-h-0 overflow-hidden">
            {sidebarTab === 'chat' && <ChatPanel userId={userId} title="Lobby Chat" />}
            {sidebarTab === 'friends' && <FriendsPanel userId={userId} onJoinGame={onJoinGame} />}
            {sidebarTab === 'achievements' && <div className="p-4 overflow-y-auto h-full"><AchievementsPanel userId={userId} /></div>}
            {sidebarTab === 'leaderboard' && <LeaderboardPanel userId={userId} />}
            {sidebarTab === 'shop' && <ShopPanel userId={userId} />}
            {sidebarTab === 'bonus' && <div className="p-4 overflow-y-auto h-full"><BonusCodePanel userId={userId} /></div>}
            {sidebarTab === 'premium' && <div className="p-4 overflow-y-auto h-full"><PremiumPanel /></div>}
            {sidebarTab === 'moderation' && <ModerationPanel userId={userId} />}
            {sidebarTab === 'profile' && <div className="p-4 overflow-y-auto h-full"><ProfilePanel userId={userId} onClose={() => setSidebarTab('chat')} /></div>}
          </div>
        </aside>

        <div className="fixed bottom-3 left-3 right-3 z-20 lg:hidden">
          <div className="glass-card px-2 py-2 flex items-center justify-between gap-1">
              {sidebarTabs.map(({ key, icon: Icon, label }) => (
              <button
                key={key}
                onClick={() => {
                  setSidebarTab(key);
                  setShowSidebar(true);
                  sounds.click();
                }}
                className={`flex flex-col items-center justify-center min-w-0 flex-1 rounded-lg py-1 transition-all ${
                  sidebarTab === key && showSidebar ? 'bg-primary/10 text-primary' : 'text-muted-foreground'
                }`}
                title={label}
              >
                <Icon className="w-3 h-3" />
                <span className="text-[8px] truncate max-w-full">{label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
