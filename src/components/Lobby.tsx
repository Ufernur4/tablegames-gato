import { useState } from 'react';
import { useGames, type Game } from '@/hooks/useGames';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ChatPanel } from '@/components/ChatPanel';
import {
  Plus,
  RefreshCw,
  Grid3X3,
  Target,
  LogOut,
  Users,
  Loader2,
  Search,
} from 'lucide-react';

interface LobbyProps {
  userId: string;
  displayName: string;
  onJoinGame: (game: Game) => void;
  onSignOut: () => void;
}

export function Lobby({ userId, displayName, onJoinGame, onSignOut }: LobbyProps) {
  const { games, loading, createGame, joinGame } = useGames();
  const [creating, setCreating] = useState(false);
  const [joinId, setJoinId] = useState('');
  const [filter, setFilter] = useState<'all' | 'waiting' | 'playing'>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | 'tic-tac-toe' | 'darts'>('all');
  const [error, setError] = useState('');

  const filteredGames = games
    .filter(g => filter === 'all' || g.status === filter)
    .filter(g => typeFilter === 'all' || g.game_type === typeFilter);

  const handleCreate = async (type: 'tic-tac-toe' | 'darts') => {
    setCreating(true);
    setError('');
    try {
      const { data, error: err } = await createGame(userId, type);
      if (err) { setError(err.message); return; }
      if (data) onJoinGame(data);
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
    switch (type) {
      case 'tic-tac-toe': return <Grid3X3 className="w-4 h-4" />;
      case 'darts': return <Target className="w-4 h-4" />;
      default: return null;
    }
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
        <Button variant="ghost" size="sm" onClick={onSignOut} className="text-muted-foreground">
          <LogOut className="w-4 h-4 mr-1" />
          <span className="hidden sm:inline">Abmelden</span>
        </Button>
      </header>

      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Main content */}
        <main className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Create game */}
          <section className="animate-fade-in-up" style={{ animationDelay: '0ms' }}>
            <h2 className="text-sm font-semibold text-foreground mb-3">Neues Spiel erstellen</h2>
            <div className="flex gap-2 flex-wrap">
              <Button
                onClick={() => handleCreate('tic-tac-toe')}
                disabled={creating}
                className="gap-2"
              >
                {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Grid3X3 className="w-4 h-4" />}
                Tic-Tac-Toe
              </Button>
              <Button
                onClick={() => handleCreate('darts')}
                disabled={creating}
                variant="secondary"
                className="gap-2"
              >
                {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Target className="w-4 h-4" />}
                Darts
              </Button>
            </div>
          </section>

          {/* Join by ID */}
          <section className="animate-fade-in-up" style={{ animationDelay: '60ms' }}>
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
              {(['all', 'tic-tac-toe', 'darts'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setTypeFilter(f)}
                  className={`status-badge transition-colors cursor-pointer ${
                    typeFilter === f ? 'bg-primary/15 text-primary' : 'bg-secondary text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {f === 'all' ? 'Alle Typen' : f === 'tic-tac-toe' ? 'Tic-Tac-Toe' : 'Darts'}
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
              filteredGames.map((game, i) => (
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
                        <span className="text-sm font-medium text-foreground capitalize">
                          {game.game_type === 'tic-tac-toe' ? 'Tic-Tac-Toe' : 'Darts'}
                        </span>
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
              ))
            )}
          </section>
        </main>

        {/* Chat sidebar */}
        <aside className="w-full lg:w-80 border-t lg:border-t-0 lg:border-l border-border h-64 lg:h-auto flex flex-col bg-card/30">
          <ChatPanel userId={userId} title="Lobby Chat" />
        </aside>
      </div>
    </div>
  );
}
