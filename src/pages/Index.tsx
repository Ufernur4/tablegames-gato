import { useState } from 'react';
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
import type { Game } from '@/hooks/useGames';
import type { BotDifficulty } from '@/hooks/useBot';
import { awardDailyLogin } from '@/lib/coinSystem';
import { Loader2 } from 'lucide-react';
import { useEffect } from 'react';

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
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return <AuthForm />;

  if (activeGame) {
    const props = { game: activeGame, userId: user.id, onLeave: () => setActiveGame(null) };
    const gt = activeGame.game_type as string;
    switch (gt) {
      case 'tic-tac-toe': return <TicTacToe {...props} />;
      case 'darts': return <Darts {...props} />;
      case 'connect-four': return <ConnectFour {...props} />;
      case 'checkers': return <Checkers {...props} />;
      case 'battleship': return <Battleship {...props} />;
      case 'trivia': return <Trivia {...props} />;
      case 'word-game': return <WordGame {...props} />;
      case 'bowling': return <Bowling {...props} />;
      case 'mini-golf': return <MiniGolf {...props} />;
      case 'pool': return <Pool {...props} />;
    }
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
