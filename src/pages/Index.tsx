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
import type { Game } from '@/hooks/useGames';
import type { BotDifficulty } from '@/hooks/useBot';
import { awardDailyLogin } from '@/lib/coinSystem';
import { Loader2 } from 'lucide-react';

const Index = () => {
  const { user, loading, displayName, signOut } = useAuth();
  const [activeGame, setActiveGame] = useState<Game | null>(null);
  const [botDifficulty, setBotDifficulty] = useState<BotDifficulty>('medium');

  usePresence(user?.id);
  useBot(activeGame, user?.id || '', botDifficulty);

  // Daily login bonus
  useEffect(() => {
    if (user?.id) awardDailyLogin(user.id);
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

  if (!user) return <AuthForm />;

  if (activeGame) {
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
    };

    const GameComponent = gameComponents[activeGame.game_type as string];
    if (GameComponent) return <GameComponent {...props} />;
  }

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
