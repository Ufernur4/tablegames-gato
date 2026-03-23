import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { AuthForm } from '@/components/AuthForm';
import { Lobby } from '@/components/Lobby';
import { TicTacToe } from '@/components/TicTacToe';
import { Darts } from '@/components/Darts';
import type { Game } from '@/hooks/useGames';
import { Loader2 } from 'lucide-react';

const Index = () => {
  const { user, loading, displayName, signOut } = useAuth();
  const [activeGame, setActiveGame] = useState<Game | null>(null);

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
    if (activeGame.game_type === 'tic-tac-toe') {
      return (
        <TicTacToe
          game={activeGame}
          userId={user.id}
          onLeave={() => setActiveGame(null)}
        />
      );
    }
    if (activeGame.game_type === 'darts') {
      return (
        <Darts
          game={activeGame}
          userId={user.id}
          onLeave={() => setActiveGame(null)}
        />
      );
    }
  }

  return (
    <Lobby
      userId={user.id}
      displayName={displayName}
      onJoinGame={setActiveGame}
      onSignOut={signOut}
    />
  );
};

export default Index;
