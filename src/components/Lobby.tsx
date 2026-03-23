import { useState } from 'react';
import { useGames, type Game } from '@/hooks/useGames';
import { createBotGame, type BotDifficulty } from '@/hooks/useBot';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ChatPanel } from '@/components/ChatPanel';
import { FriendsPanel } from '@/components/FriendsPanel';
import { ProfilePanel } from '@/components/ProfilePanel';
import {
  RefreshCw,
  Grid3X3,
  Target,
  LogOut,
  Users,
  Loader2,
  Search,
  User,
  MessageSquare,
  UserPlus,
  Cpu,
  Circle,
  Crosshair,
  Bot,
} from 'lucide-react';

// Map for game icons
const GAME_TYPES = [
  { id: 'tic-tac-toe' as const, label: 'Tic-Tac-Toe', icon: Grid3X3 },
  { id: 'connect-four' as const, label: 'Vier Gewinnt', icon: Circle },
  { id: 'darts' as const, label: 'Darts', icon: Target },
  { id: 'checkers' as const, label: 'Dame', icon: Cpu },
  { id: 'battleship' as const, label: 'Schiffe versenken', icon: Crosshair },
] as const;

type GameTypeId = typeof GAME_TYPES[number]['id'];

interface LobbyProps {
  userId: string;
  displayName: string;
  onJoinGame: (game: Game, botDifficulty?: BotDifficulty) => void;
  onSignOut: () => void;
}

type SidebarTab = 'chat' | 'friends' | 'profile';

export function Lobby({ userId, displayName, onJoinGame, onSignOut }: LobbyProps) {
  const { games, loading, createGame, joinGame } = useGames();
  const [creating, setCreating] = useState(false);
  const [joinId, setJoinId] = useState('');
  const [filter, setFilter] = useState<'all' | 'waiting' | 'playing'>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | GameTypeId>('all');
  const [error, setError] = useState('');
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('chat');
  const [showBotMenu, setShowBotMenu] = useState(false);
  const [selectedBotGame, setSelectedBotGame] = useState<GameTypeId | null>(null);

  const filteredGames = games
    .filter(g => filter === 'all' || g.status === filter)
    .filter(g => typeFilter === 'all' || g.game_type === typeFilter);

  const handleCreate = async (type: GameTypeId) => {
    setCreating(true);
    setError('');
    try {
      const { data, error: err } = await createGame(userId, type as any);
      if (err) { setError(err.message); return; }
      if (data) onJoinGame(data);
    } catch { setError('Fehler beim Erstellen.'); }
    finally { setCreating(false); }
  };

  const handleCreateBot = async (type: GameTypeId, difficulty: BotDifficulty) => {
    setCreating(true);
    setError('');
    setShowBotMenu(false);
    setSelectedBotGame(null);
    try {
      const { data, error: err } = await createBotGame(userId, type as any, difficulty);
      if (err) { setError(err.message); return; }
      if (data) onJoinGame(data, difficulty);
    } catch { setError('Fehler beim Erstellen.'); }
    finally { setCreating(false); }
  };

  const handleJoin = async (game: Game) => {
    setError('');
    try {
      const { error: err } = await joinGame(game.id, userId);
      if (err) { setError(err.message); return; }
      onJoinGame({ ...game, player_o: userId, status: 'playing' });
    } catch { setError('Fehler beim Beitreten.'); }
  };

  const handleJoinById = async () => {
    if (!joinId.trim()) return;
    const game = games.find(g => g.id === joinId.trim());
    if (!game) { setError('Spiel nicht gefunden.'); return; }
    if (game.status !== 'waiting') { setError('Spiel ist nicht mehr verfügbar.'); return; }
    await handleJoin(game);
  };

  const getGameIcon = (type: string) => {
    const gt = GAME_TYPES.find(t => t.id === type);
    if (!gt) return null;
    const Icon = gt.icon;
    return <Icon className="w-4 h-4" />;
  };

  const getGameLabel = (type: string) => {
    return GAME_TYPES.find(t => t.id === type)?.label || type;
  };

  const getPlayerCount = (g: Game) => {
    const count = [g.player_x, g.player_o].filter(Boolean).length;
    return `${count}/2`;
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="border-b border-border px-4 py-3 flex items-center justify-between bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold text-primary tracking-tight">X-Play</h1>
          <span className="text-xs text-muted-foreground bg-secondary rounded-full px-2.5 py-0.5">
            {displayName}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost" size="sm"
            onClick={() => setSidebarTab('profile')}
            className={`text-muted-foreground ${sidebarTab === 'profile' ? 'text-primary' : ''}`}
          >
            <User className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={onSignOut} className="text-muted-foreground">
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      </header>

      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        <main className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Create game */}
          <section className="animate-fade-in-up" style={{ animationDelay: '0ms' }}>
            <h2 className="text-sm font-semibold text-foreground mb-3">Neues Spiel erstellen</h2>
            <div className="flex gap-2 flex-wrap">
              {GAME_TYPES.map(({ id, label, icon: Icon }) => (
                <Button
                  key={id}
                  onClick={() => handleCreate(id)}
                  disabled={creating}
                  variant={id === 'tic-tac-toe' ? 'default' : 'secondary'}
                  className="gap-2 text-xs"
                  size="sm"
                >
                  {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Icon className="w-3.5 h-3.5" />}
                  {label}
                </Button>
              ))}
            </div>
          </section>

          {/* Bot game */}
          <section className="animate-fade-in-up" style={{ animationDelay: '40ms' }}>
            <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
              <Bot className="w-4 h-4 text-primary" />
              Gegen Bot spielen
            </h2>
            {!showBotMenu ? (
              <Button variant="secondary" size="sm" onClick={() => setShowBotMenu(true)} className="gap-2 text-xs">
                <Bot className="w-3.5 h-3.5" /> Bot-Spiel starten
              </Button>
            ) : (
              <div className="space-y-2">
                {!selectedBotGame ? (
                  <div className="flex gap-2 flex-wrap">
                    {GAME_TYPES.map(({ id, label, icon: Icon }) => (
                      <Button
                        key={id}
                        onClick={() => setSelectedBotGame(id)}
                        variant="secondary"
                        size="sm"
                        className="gap-2 text-xs"
                      >
                        <Icon className="w-3.5 h-3.5" /> {label}
                      </Button>
                    ))}
                    <Button variant="ghost" size="sm" onClick={() => setShowBotMenu(false)} className="text-xs text-muted-foreground">
                      Abbrechen
                    </Button>
                  </div>
                ) : (
                  <div className="flex gap-2 flex-wrap items-center">
                    <span className="text-xs text-muted-foreground">Schwierigkeit:</span>
                    {(['easy', 'medium', 'hard'] as BotDifficulty[]).map(d => (
                      <Button
                        key={d}
                        onClick={() => handleCreateBot(selectedBotGame, d)}
                        disabled={creating}
                        variant="secondary"
                        size="sm"
                        className="gap-1 text-xs"
                      >
                        {creating && <Loader2 className="w-3 h-3 animate-spin" />}
                        {d === 'easy' ? '🟢 Leicht' : d === 'medium' ? '🟡 Mittel' : '🔴 Schwer'}
                      </Button>
                    ))}
                    <Button variant="ghost" size="sm" onClick={() => setSelectedBotGame(null)} className="text-xs text-muted-foreground">
                      Zurück
                    </Button>
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Join by ID */}
          <section className="animate-fade-in-up" style={{ animationDelay: '80ms' }}>
            <h2 className="text-sm font-semibold text-foreground mb-3">Per Spiel-ID beitreten</h2>
            <div className="flex gap-2">
              <Input
                value={joinId}
                onChange={e => setJoinId(e.target.value)}
                placeholder="Spiel-ID eingeben…"
                className="bg-secondary border-border text-sm"
              />
              <Button onClick={handleJoinById} variant="secondary" size="sm">
                Beitreten
              </Button>
            </div>
          </section>

          {error && (
            <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-xs text-destructive animate-fade-in">
              {error}
            </div>
          )}

          {/* Filters */}
          <section className="animate-fade-in-up" style={{ animationDelay: '120ms' }}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-foreground">Verfügbare Spiele</h2>
              <Button variant="ghost" size="sm" className="text-muted-foreground h-7 px-2">
                <RefreshCw className="w-3.5 h-3.5" />
              </Button>
            </div>
            <div className="flex gap-1.5 flex-wrap mb-3">
              {(['all', 'waiting', 'playing'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`status-badge transition-colors cursor-pointer ${
                    filter === f ? 'bg-primary/15 text-primary' : 'bg-secondary text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {f === 'all' ? 'Alle' : f === 'waiting' ? 'Wartend' : 'Läuft'}
                </button>
              ))}
              <span className="w-px h-5 bg-border self-center mx-1" />
              {[{ id: 'all' as const, label: 'Alle Typen' }, ...GAME_TYPES].map(f => (
                <button
                  key={f.id}
                  onClick={() => setTypeFilter(f.id)}
                  className={`status-badge transition-colors cursor-pointer ${
                    typeFilter === f.id ? 'bg-primary/15 text-primary' : 'bg-secondary text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </section>

          {/* Game list */}
          <section className="space-y-2">
            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : filteredGames.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                <Search className="w-8 h-8 mx-auto mb-2 opacity-40" />
                Keine Spiele gefunden. Erstelle ein neues!
              </div>
            ) : (
              filteredGames.map((game, i) => {
                const isBotGame = game.player_o === '00000000-0000-0000-0000-000000000000';
                return (
                  <div
                    key={game.id}
                    className="game-card flex items-center justify-between gap-3 animate-fade-in-up"
                    style={{ animationDelay: `${180 + i * 60}ms` }}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center shrink-0 text-muted-foreground">
                        {getGameIcon(game.game_type)}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-foreground">
                            {getGameLabel(game.game_type)}
                          </span>
                          {isBotGame && (
                            <span className="status-badge bg-[hsl(var(--info)/0.15)] text-[hsl(var(--info))]">
                              <Bot className="w-3 h-3" /> Bot
                            </span>
                          )}
                          <span className={`status-badge ${
                            game.status === 'waiting' ? 'status-waiting' :
                            game.status === 'playing' ? 'status-playing' : 'status-finished'
                          }`}>
                            {game.status === 'waiting' ? 'Wartend' :
                             game.status === 'playing' ? 'Läuft' : 'Beendet'}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] text-muted-foreground font-mono truncate">
                            {game.id.slice(0, 8)}…
                          </span>
                          <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                            <Users className="w-3 h-3" />
                            {getPlayerCount(game)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {game.status === 'waiting' && game.created_by !== userId && (
                      <Button size="sm" onClick={() => handleJoin(game)} className="shrink-0 h-7 text-xs">
                        Beitreten
                      </Button>
                    )}
                    {game.created_by === userId && game.status === 'waiting' && (
                      <Button size="sm" variant="secondary" onClick={() => onJoinGame(game)} className="shrink-0 h-7 text-xs">
                        Öffnen
                      </Button>
                    )}
                    {(game.player_x === userId || game.player_o === userId) && game.status === 'playing' && (
                      <Button size="sm" onClick={() => onJoinGame(game)} className="shrink-0 h-7 text-xs">
                        Weiterspielen
                      </Button>
                    )}
                  </div>
                );
              })
            )}
          </section>
        </main>

        {/* Sidebar */}
        <aside className="w-full lg:w-80 border-t lg:border-t-0 lg:border-l border-border flex flex-col bg-card/30">
          <div className="flex border-b border-border">
            {([
              { key: 'chat' as SidebarTab, icon: MessageSquare, label: 'Chat' },
              { key: 'friends' as SidebarTab, icon: UserPlus, label: 'Freunde' },
              { key: 'profile' as SidebarTab, icon: User, label: 'Profil' },
            ]).map(({ key, icon: Icon, label }) => (
              <button
                key={key}
                onClick={() => setSidebarTab(key)}
                className={`flex-1 px-3 py-2.5 text-xs font-medium transition-colors ${
                  sidebarTab === key ? 'text-primary border-b-2 border-primary' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Icon className="w-3.5 h-3.5 inline mr-1" />
                {label}
              </button>
            ))}
          </div>

          <div className="flex-1 min-h-0 h-64 lg:h-auto overflow-hidden">
            {sidebarTab === 'chat' && <ChatPanel userId={userId} title="Lobby Chat" />}
            {sidebarTab === 'friends' && <FriendsPanel userId={userId} onJoinGame={onJoinGame} />}
            {sidebarTab === 'profile' && (
              <div className="p-4 overflow-y-auto h-full">
                <ProfilePanel userId={userId} onClose={() => setSidebarTab('chat')} />
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
