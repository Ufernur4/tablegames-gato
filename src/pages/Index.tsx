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
import type { Game } from '@/hooks/useGames';
import type { BotDifficulty } from '@/hooks/useBot';
import { Loader2 } from 'lucide-react';

const Index = () => {
  const { user, loading, displayName, signOut } = useAuth();
  const [activeGame, setActiveGame] = useState<Game | null>(null);
  const [botDifficulty, setBotDifficulty] = useState<BotDifficulty>('medium');

  // Track online presence
  usePresence(user?.id);

  // Bot AI hook – auto-plays when it's the bot's turn
  useBot(activeGame, user?.id || '', botDifficulty);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <AuthForm />;
  }

  if (activeGame) {
    const gameType = activeGame.game_type as string;
    const props = {
      game: activeGame,
      userId: user.id,
      onLeave: () => setActiveGame(null),
    };

    switch (gameType) {
      case 'tic-tac-toe': return <TicTacToe {...props} />;
      case 'darts': return <Darts {...props} />;
      case 'connect-four': return <ConnectFour {...props} />;
      case 'checkers': return <Checkers {...props} />;
      case 'battleship': return <Battleship {...props} />;
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
