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
import { sounds, isSoundEnabled, toggleSound } from '@/lib/sounds';
import { t, getLang, setLang, LANGUAGES, type Lang } from '@/lib/i18n';
import {
  RefreshCw, Grid3X3, Target, LogOut, Users, Loader2, Search,
  User, MessageSquare, UserPlus, Cpu, Circle, Crosshair, Bot,
  ShoppingBag, Dices, Flag, HelpCircle, Type, Crown, Gamepad2,
  Brain, Hand, Sparkles, Volume2, VolumeX, Trophy, Star,
  Gift, Download, Zap, Link2,
} from 'lucide-react';

const GAME_TYPES = [
  { id: 'tic-tac-toe' as const, label: 'Tic-Tac-Toe', icon: Grid3X3, emoji: '❌' },
  { id: 'connect-four' as const, label: 'Vier Gewinnt', icon: Circle, emoji: '🔴' },
  { id: 'chess' as const, label: 'Schach', icon: Crown, emoji: '♔' },
  { id: 'checkers' as const, label: 'Dame', icon: Cpu, emoji: '⬛' },
  { id: 'ludo' as const, label: 'Ludo', icon: Dices, emoji: '🎲' },
  { id: 'darts' as const, label: 'Darts', icon: Target, emoji: '🎯' },
  { id: 'battleship' as const, label: 'Schiffe versenken', icon: Crosshair, emoji: '🚢' },
  { id: 'bowling' as const, label: 'Bowling', icon: Dices, emoji: '🎳' },
  { id: 'mini-golf' as const, label: 'Mini Golf', icon: Flag, emoji: '⛳' },
  { id: 'pool' as const, label: '8-Ball Pool', icon: Circle, emoji: '🎱' },
  { id: 'trivia' as const, label: 'Trivia', icon: HelpCircle, emoji: '🧠' },
  { id: 'word-game' as const, label: 'Wortspiel', icon: Type, emoji: '📝' },
  { id: 'memory' as const, label: 'Memory', icon: Brain, emoji: '🧩' },
  { id: 'rock-paper-scissors' as const, label: 'Schere Stein Papier', icon: Hand, emoji: '✊' },
] as const;

type GameTypeId = typeof GAME_TYPES[number]['id'];

interface LobbyProps {
  userId: string;
  displayName: string;
  onJoinGame: (game: Game, botDifficulty?: BotDifficulty) => void;
  onSignOut: () => void;
}

type SidebarTab = 'chat' | 'friends' | 'profile' | 'shop' | 'achievements' | 'leaderboard' | 'bonus' | 'premium';

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

// PWA install prompt
function useInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      if (!localStorage.getItem('xplay-pwa-dismissed')) {
        setShowBanner(true);
      }
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const install = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      setDeferredPrompt(null);
      setShowBanner(false);
    }
  };

  const dismiss = () => {
    setShowBanner(false);
    localStorage.setItem('xplay-pwa-dismissed', '1');
  };

  return { showBanner, install, dismiss, canInstall: !!deferredPrompt };
}

export function Lobby({ userId, displayName, onJoinGame, onSignOut }: LobbyProps) {
  const { games, loading, createGame, joinGame, deleteGame } = useGames();
  const [creating, setCreating] = useState(false);
  const [joinId, setJoinId] = useState('');
  const [filter, setFilter] = useState<'all' | 'waiting' | 'playing'>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | GameTypeId>('all');
  const [error, setError] = useState('');
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('chat');
  const [showBotMenu, setShowBotMenu] = useState(false);
  const [selectedBotGame, setSelectedBotGame] = useState<GameTypeId | null>(null);
  const [easterEgg, setEasterEgg] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [soundOn, setSoundOn] = useState(isSoundEnabled());
  const [lang, setCurrentLang] = useState<Lang>(getLang());
  const { showBanner, install, dismiss } = useInstallPrompt();

  useKonamiCode(useCallback(() => {
    setEasterEgg(true);
    sounds.achievement();
    setTimeout(() => setEasterEgg(false), 5000);
  }, []));

  const filteredGames = games
    .filter(g => filter === 'all' || g.status === filter)
    .filter(g => typeFilter === 'all' || g.game_type === typeFilter)
    .filter(g => !searchQuery || g.id.includes(searchQuery) || g.game_type.includes(searchQuery));

  const handleCreate = async (type: GameTypeId) => {
    setCreating(true);
    setError('');
    sounds.click();
    try {
      const { data, error: err } = await createGame(userId, type as any);
      if (err) { setError(err.message); return; }
      if (data) { sounds.navigate(); onJoinGame(data); }
    } catch { setError('Fehler beim Erstellen.'); }
    finally { setCreating(false); }
  };

  const handleCreateBot = async (type: GameTypeId, difficulty: BotDifficulty) => {
    setCreating(true);
    setError('');
    setShowBotMenu(false);
    setSelectedBotGame(null);
    sounds.click();
    try {
      const { data, error: err } = await createBotGame(userId, type as any, difficulty);
      if (err) { setError(err.message); return; }
      if (data) { sounds.navigate(); onJoinGame(data, difficulty); }
    } catch { setError('Fehler beim Erstellen.'); }
    finally { setCreating(false); }
  };

  const handleJoin = async (game: Game) => {
    setError('');
    sounds.click();
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
    if (game.status !== 'waiting') { setError('Spiel ist nicht mehr verfügbar.'); return; }
    await handleJoin(game);
  };

  const getGameLabel = (type: string) => GAME_TYPES.find(t => t.id === type)?.label || type;
  const getGameEmoji = (type: string) => GAME_TYPES.find(t => t.id === type)?.emoji || '🎮';
  const getPlayerCount = (g: Game) => `${[g.player_x, g.player_o].filter(Boolean).length}/2`;

  const myActiveGames = games.filter(g => (g.player_x === userId || g.player_o === userId) && g.status === 'playing').length;
  const myWins = games.filter(g => g.winner === userId).length;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {easterEgg && (
        <div className="fixed inset-0 pointer-events-none z-50 flex items-center justify-center">
          <div className="text-6xl animate-bounce">🎉🎊🎮🏆✨</div>
        </div>
      )}

      {/* PWA Install Banner */}
      {showBanner && (
        <div className="pwa-install-banner">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center shrink-0 animate-pulse-glow">
              <Download className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">X-Play installieren</p>
              <p className="text-[10px] text-muted-foreground">Spiele offline & direkt vom Homescreen</p>
            </div>
            <div className="flex gap-1.5 shrink-0">
              <Button size="sm" onClick={install} className="text-xs h-7 gap-1 glow-primary-sm">
                <Download className="w-3 h-3" /> Installieren
              </Button>
              <Button size="sm" variant="ghost" onClick={dismiss} className="text-xs h-7 text-muted-foreground">✕</Button>
            </div>
          </div>
        </div>
      )}

      <header className="border-b border-border px-4 py-3 flex items-center justify-between bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold text-primary tracking-tight flex items-center gap-1.5">
            <Gamepad2 className="w-5 h-5" /> X-Play
          </h1>
          <span className="text-xs text-muted-foreground bg-secondary rounded-full px-2.5 py-0.5">{displayName}</span>
          {myActiveGames > 0 && (
            <span className="text-[10px] bg-primary/15 text-primary rounded-full px-2 py-0.5 flex items-center gap-1">
              <Sparkles className="w-3 h-3" /> {myActiveGames} aktiv
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {myWins > 0 && (
            <span className="text-[10px] text-primary flex items-center gap-0.5 mr-2 streak-glow">
              <Trophy className="w-3 h-3" /> {myWins}
            </span>
          )}
          <select
            value={lang}
            onChange={e => { const l = e.target.value as Lang; setLang(l); setCurrentLang(l); }}
            className="bg-secondary text-foreground text-[10px] rounded px-1.5 py-1 border border-border cursor-pointer"
          >
            {LANGUAGES.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}
          </select>
          <Button variant="ghost" size="sm" onClick={() => { setSoundOn(toggleSound()); }} className="text-muted-foreground">
            {soundOn ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setSidebarTab('profile')} className={`text-muted-foreground ${sidebarTab === 'profile' ? 'text-primary' : ''}`}>
            <User className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={onSignOut} className="text-muted-foreground">
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      </header>

      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        <main className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Quick stats */}
          <div className="flex gap-2 animate-fade-in">
            {[
              { value: games.filter(g => g.status === 'waiting').length, label: 'Wartend', color: '' },
              { value: games.filter(g => g.status === 'playing').length, label: 'Aktiv', color: '' },
              { value: GAME_TYPES.length, label: 'Spiele', color: 'text-primary' },
            ].map(({ value, label, color }) => (
              <div key={label} className="flex-1 rounded-xl bg-card border border-border p-3 text-center card-3d">
                <p className={`text-lg font-bold tabular-nums ${color || 'text-foreground'}`}>{value}</p>
                <p className="text-[10px] text-muted-foreground">{label}</p>
              </div>
            ))}
          </div>

          {/* Create game */}
          <section className="animate-fade-in-up">
            <h2 className="text-sm font-semibold text-foreground mb-3">🎮 Neues Spiel erstellen</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {GAME_TYPES.map(({ id, label, emoji }) => (
                <button
                  key={id}
                  onClick={() => handleCreate(id)}
                  disabled={creating}
                  className="flex items-center gap-2 rounded-xl bg-card border border-border px-3 py-2.5 text-xs font-medium text-foreground hover:border-primary/40 hover:bg-card/80 transition-all active:scale-95 disabled:opacity-50 card-3d"
                >
                  <span className="text-base piece-3d">{emoji}</span>
                  <span className="truncate">{label}</span>
                </button>
              ))}
            </div>
          </section>

          {/* Bot game */}
          <section className="animate-fade-in-up" style={{ animationDelay: '40ms' }}>
            <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
              <Bot className="w-4 h-4 text-primary" /> Gegen Bot spielen
            </h2>
            {!showBotMenu ? (
              <Button variant="secondary" size="sm" onClick={() => { setShowBotMenu(true); sounds.click(); }} className="gap-2 text-xs">
                <Bot className="w-3.5 h-3.5" /> Bot-Spiel starten
              </Button>
            ) : (
              <div className="space-y-2">
                {!selectedBotGame ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {GAME_TYPES.map(({ id, label, emoji }) => (
                      <button
                        key={id}
                        onClick={() => { setSelectedBotGame(id); sounds.click(); }}
                        className="flex items-center gap-2 rounded-xl bg-secondary border border-border px-3 py-2 text-xs text-foreground hover:border-primary/30 transition-all active:scale-95"
                      >
                        <span>{emoji}</span> {label}
                      </button>
                    ))}
                    <button onClick={() => setShowBotMenu(false)} className="text-xs text-muted-foreground hover:text-foreground px-3 py-2">
                      Abbrechen
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2 flex-wrap items-center">
                    <span className="text-xs text-muted-foreground">Schwierigkeit:</span>
                    {(['easy', 'medium', 'hard'] as BotDifficulty[]).map(d => (
                      <Button key={d} onClick={() => handleCreateBot(selectedBotGame, d)} disabled={creating} variant="secondary" size="sm" className="gap-1 text-xs">
                        {creating && <Loader2 className="w-3 h-3 animate-spin" />}
                        {d === 'easy' ? '🟢 Leicht' : d === 'medium' ? '🟡 Mittel' : '🔴 Schwer'}
                      </Button>
                    ))}
                    <Button variant="ghost" size="sm" onClick={() => setSelectedBotGame(null)} className="text-xs text-muted-foreground">Zurück</Button>
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Join by ID */}
          <section className="animate-fade-in-up" style={{ animationDelay: '80ms' }}>
            <h2 className="text-sm font-semibold text-foreground mb-3">🔑 Per Spiel-ID beitreten</h2>
            <div className="flex gap-2">
              <Input value={joinId} onChange={e => setJoinId(e.target.value)} placeholder="Spiel-ID eingeben…" className="bg-secondary border-border text-sm" />
              <Button onClick={handleJoinById} variant="secondary" size="sm">Beitreten</Button>
            </div>
          </section>

          {error && (
            <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-xs text-destructive animate-shake">{error}</div>
          )}

          {/* Filters */}
          <section className="animate-fade-in-up" style={{ animationDelay: '120ms' }}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-foreground">📋 Verfügbare Spiele</h2>
              <div className="flex items-center gap-2">
                <Input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Suche…" className="bg-secondary border-border text-xs h-7 w-32" />
                <Button variant="ghost" size="sm" className="text-muted-foreground h-7 px-2"><RefreshCw className="w-3.5 h-3.5" /></Button>
              </div>
            </div>
            <div className="flex gap-1.5 flex-wrap mb-3">
              {(['all', 'waiting', 'playing'] as const).map(f => (
                <button key={f} onClick={() => { setFilter(f); sounds.click(); }} className={`status-badge transition-colors cursor-pointer ${filter === f ? 'bg-primary/15 text-primary' : 'bg-secondary text-muted-foreground hover:text-foreground'}`}>
                  {f === 'all' ? 'Alle' : f === 'waiting' ? 'Wartend' : 'Läuft'}
                </button>
              ))}
              <span className="w-px h-5 bg-border self-center mx-1" />
              <button onClick={() => setTypeFilter('all')} className={`status-badge transition-colors cursor-pointer ${typeFilter === 'all' ? 'bg-primary/15 text-primary' : 'bg-secondary text-muted-foreground hover:text-foreground'}`}>
                Alle Typen
              </button>
              {GAME_TYPES.map(f => (
                <button key={f.id} onClick={() => setTypeFilter(f.id)} className={`status-badge transition-colors cursor-pointer ${typeFilter === f.id ? 'bg-primary/15 text-primary' : 'bg-secondary text-muted-foreground hover:text-foreground'}`}>
                  {f.emoji} {f.label}
                </button>
              ))}
            </div>
          </section>

          {/* Game list */}
          <section className="space-y-2">
            {loading ? (
              <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
            ) : filteredGames.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                <Search className="w-8 h-8 mx-auto mb-2 opacity-40" />
                Keine Spiele gefunden. Erstelle ein neues!
              </div>
            ) : (
              filteredGames.map((game, i) => {
                const isBotGame = game.player_o === '00000000-0000-0000-0000-000000000000';
                const isMyGame = game.player_x === userId || game.player_o === userId;
                return (
                  <div key={game.id} className={`game-card flex items-center justify-between gap-3 animate-fade-in-up ${isMyGame ? 'border-primary/20' : ''}`} style={{ animationDelay: `${180 + i * 40}ms` }}>
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center shrink-0 text-base piece-3d">
                        {getGameEmoji(game.game_type)}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-foreground">{getGameLabel(game.game_type)}</span>
                          {isBotGame && <span className="status-badge bg-[hsl(var(--info)/0.15)] text-[hsl(var(--info))]"><Bot className="w-3 h-3" /> Bot</span>}
                          {isMyGame && <span className="status-badge bg-primary/10 text-primary"><Star className="w-3 h-3" /></span>}
                          <span className={`status-badge ${game.status === 'waiting' ? 'status-waiting' : game.status === 'playing' ? 'status-playing' : 'status-finished'}`}>
                            {game.status === 'waiting' ? 'Wartend' : game.status === 'playing' ? 'Läuft' : 'Beendet'}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] text-muted-foreground font-mono truncate">{game.id.slice(0, 8)}…</span>
                          <span className="text-[10px] text-muted-foreground flex items-center gap-0.5"><Users className="w-3 h-3" />{getPlayerCount(game)}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      {game.status === 'waiting' && game.created_by !== userId && (
                        <Button size="sm" onClick={() => handleJoin(game)} className="h-7 text-xs">Beitreten</Button>
                      )}
                      {game.created_by === userId && game.status === 'waiting' && (
                        <>
                          <Button size="sm" variant="secondary" onClick={() => onJoinGame(game)} className="h-7 text-xs">Öffnen</Button>
                          <Button size="sm" variant="ghost" onClick={() => deleteGame(game.id)} className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive">✕</Button>
                        </>
                      )}
                      {(game.player_x === userId || game.player_o === userId) && game.status === 'playing' && (
                        <Button size="sm" onClick={() => onJoinGame(game)} className="h-7 text-xs">Weiterspielen</Button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </section>
        </main>

        {/* Sidebar */}
        <aside className="w-full lg:w-80 border-t lg:border-t-0 lg:border-l border-border flex flex-col bg-card/30">
          <div className="flex border-b border-border overflow-x-auto scrollbar-thin">
            {([
              { key: 'chat' as SidebarTab, icon: MessageSquare, label: 'Chat' },
              { key: 'friends' as SidebarTab, icon: UserPlus, label: 'Freunde' },
              { key: 'leaderboard' as SidebarTab, icon: Crown, label: 'Ranking' },
              { key: 'achievements' as SidebarTab, icon: Trophy, label: 'Erfolge' },
              { key: 'shop' as SidebarTab, icon: ShoppingBag, label: 'Shop' },
              { key: 'bonus' as SidebarTab, icon: Gift, label: 'Bonus' },
              { key: 'premium' as SidebarTab, icon: Zap, label: 'VIP' },
              { key: 'profile' as SidebarTab, icon: User, label: 'Profil' },
            ]).map(({ key, icon: Icon, label }) => (
              <button key={key} onClick={() => { setSidebarTab(key); sounds.click(); }} className={`flex-none px-2 py-2.5 text-[10px] font-medium transition-colors whitespace-nowrap ${sidebarTab === key ? 'text-primary border-b-2 border-primary' : 'text-muted-foreground hover:text-foreground'}`}>
                <Icon className="w-3.5 h-3.5 inline mr-0.5" />{label}
              </button>
            ))}
          </div>
          <div className="flex-1 min-h-0 h-64 lg:h-auto overflow-hidden">
            {sidebarTab === 'chat' && <ChatPanel userId={userId} title="Lobby Chat" />}
            {sidebarTab === 'friends' && <FriendsPanel userId={userId} onJoinGame={onJoinGame} />}
            {sidebarTab === 'achievements' && (
              <div className="p-4 overflow-y-auto h-full"><AchievementsPanel userId={userId} /></div>
            )}
            {sidebarTab === 'leaderboard' && <LeaderboardPanel userId={userId} />}
            {sidebarTab === 'shop' && <ShopPanel userId={userId} />}
            {sidebarTab === 'bonus' && (
              <div className="p-4 overflow-y-auto h-full"><BonusCodePanel userId={userId} /></div>
            )}
            {sidebarTab === 'premium' && (
              <div className="p-4 overflow-y-auto h-full"><PremiumPanel /></div>
            )}
            {sidebarTab === 'profile' && (
              <div className="p-4 overflow-y-auto h-full"><ProfilePanel userId={userId} onClose={() => setSidebarTab('chat')} /></div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
