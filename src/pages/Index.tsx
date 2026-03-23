import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { usePresence } from '@/hooks/usePresence';
import { useBot } from '@/hooks/useBot';
import { AuthForm } from '@/components/AuthForm';
import { Lobby } from '@/components/Lobby';
import { TicTacToe } from '@/components/TicTacToe';
import { Darts } from '@/components/Darts';
import { ConnectFour } from '@/components/ConnectFour';
import { Checkers } from '@/components/Checkers';
import { Battleship } from '@/components/Battleship';
import { Trivia } from '@/components/Trivia';
import { WordGame } from '@/components/WordGame';
import { Bowling } from '@/components/Bowling';
import { MiniGolf } from '@/components/MiniGolf';
import { Pool } from '@/components/Pool';
import { Chess } from '@/components/Chess';
import { Ludo } from '@/components/Ludo';
import { Memory } from '@/components/Memory';
import { RockPaperScissors } from '@/components/RockPaperScissors';
import { TableSoccer } from '@/components/TableSoccer';
import type { Game } from '@/hooks/useGames';
import type { BotDifficulty } from '@/hooks/useBot';
import { awardDailyLogin } from '@/lib/coinSystem';
import { sounds } from '@/lib/sounds';
import { Loader2 } from 'lucide-react';

const Index = () => {
  const { user, loading, displayName, signOut } = useAuth();
  const [activeGame, setActiveGame] = useState<Game | null>(null);
  const [botDifficulty, setBotDifficulty] = useState<BotDifficulty>('medium');
  const [guestMode, setGuestMode] = useState(false);
  const [pendingJoinId, setPendingJoinId] = useState<string | null>(null);

  // Check for join link
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const joinId = params.get('join');
    if (joinId) {
      setPendingJoinId(joinId);
      window.history.replaceState({}, '', '/');
    }
  }, []);

  usePresence(user?.id);
  useBot(activeGame, user?.id || '', botDifficulty);

  // Daily login bonus
  useEffect(() => {
    if (user?.id) {
      awardDailyLogin(user.id).then(amount => {
        if (amount > 0) sounds.coinEarn();
      });
    }
  }, [user?.id]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3 animate-fade-in">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Laden…</p>
        </div>
      </div>
    );
  }

  if (!user && !guestMode) return <AuthForm onGuestPlay={() => setGuestMode(true)} />;

  // Guest mode - limited view
  if (!user && guestMode) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <header className="border-b border-border px-4 py-3 flex items-center justify-between bg-card/50 backdrop-blur-sm sticky top-0 z-10">
          <h1 className="text-lg font-bold text-primary tracking-tight">🎮 X-Play</h1>
          <button onClick={() => setGuestMode(false)} className="text-xs text-primary hover:underline">
            Anmelden zum Spielen
          </button>
        </header>
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="text-center space-y-4 animate-fade-in-up max-w-sm">
            <div className="text-6xl animate-float">👀</div>
            <h2 className="text-xl font-bold text-foreground">Gastzugang</h2>
            <p className="text-sm text-muted-foreground">
              Um Spiele zu spielen, Freunde hinzuzufügen und Münzen zu verdienen, erstelle ein kostenloses Konto.
            </p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              {['❌ Tic-Tac-Toe','🔴 Vier Gewinnt','♔ Schach','🎯 Darts','🎳 Bowling','🧠 Trivia','🎲 Ludo','🧩 Memory'].map(g => (
                <div key={g} className="rounded-xl bg-card border border-border p-3 card-3d opacity-60">
                  {g}
                </div>
              ))}
            </div>
            <button onClick={() => setGuestMode(false)} className="text-sm text-primary font-medium hover:underline">
              → Jetzt registrieren & losspielen
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (activeGame && user) {
    const props = { game: activeGame, userId: user.id, onLeave: () => setActiveGame(null) };
    const gameComponents: Record<string, React.ComponentType<typeof props>> = {
      'tic-tac-toe': TicTacToe,
      'darts': Darts,
      'connect-four': ConnectFour,
      'checkers': Checkers,
      'battleship': Battleship,
      'trivia': Trivia,
      'word-game': WordGame,
      'bowling': Bowling,
      'mini-golf': MiniGolf,
      'pool': Pool,
      'chess': Chess,
      'ludo': Ludo,
      'memory': Memory,
      'rock-paper-scissors': RockPaperScissors,
      'table-soccer': TableSoccer,
    };

    const GameComponent = gameComponents[activeGame.game_type as string];
    if (GameComponent) return <GameComponent {...props} />;
  }

  if (!user) return <AuthForm />;

  return (
    <Lobby
      userId={user.id}
      displayName={displayName}
      onJoinGame={(game, difficulty) => {
        if (difficulty) setBotDifficulty(difficulty);
        setActiveGame(game);
      }}
      onSignOut={signOut}
    />
  );
};

export default Index;
