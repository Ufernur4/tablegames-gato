import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Game } from '@/hooks/useGames';
import { ChatPanel } from '@/components/ChatPanel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Trophy, RotateCcw } from 'lucide-react';

interface WordGameProps {
  game: Game;
  userId: string;
  onLeave: () => void;
}

const WORDS = [
  'APFEL', 'BRÜCKE', 'DRACHE', 'ELEFANT', 'FREUND', 'GARTEN', 'HIMMEL',
  'INSEL', 'JUBEL', 'KATZE', 'LÖWE', 'MOND', 'NACHT', 'OZEAN', 'PIANO',
  'REGEN', 'SONNE', 'TURM', 'UFER', 'VOGEL', 'WASSER', 'ZEBRA', 'BLUME',
  'STERN', 'WOLKE', 'FEUER', 'KRAFT', 'GLÜCK', 'TRAUM', 'PERLE',
  'SCHIFF', 'PFERD', 'KIRCHE', 'STURM', 'LICHT', 'BAUM', 'BERG',
  'FISCH', 'STEIN', 'WIND',
];

const MAX_WRONG = 6;

export function WordGame({ game: initialGame, userId, onLeave }: WordGameProps) {
  const [game, setGame] = useState<Game>(initialGame);
  const [letterInput, setLetterInput] = useState('');
  const [error, setError] = useState('');

  const gameData = (game.game_data || {}) as Record<string, any>;
  const isPlayerX = game.player_x === userId;
  const word: string = gameData.word || 'FEHLER';
  const guessedLetters: string[] = gameData.guessed_letters || [];
  const wrongGuesses: number = gameData.wrong_guesses || 0;
  const isMyTurn = game.current_turn === userId;
  const playerXScore = gameData.player_x_score ?? 0;
  const playerOScore = gameData.player_o_score ?? 0;

  // Check if word is solved
  const isSolved = word.split('').every(l => guessedLetters.includes(l));
  const isHanged = wrongGuesses >= MAX_WRONG;

  useEffect(() => {
    const channel = supabase
      .channel(`game-${initialGame.id}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'games',
        filter: `id=eq.${initialGame.id}`,
      }, (payload) => setGame(payload.new as unknown as Game))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [initialGame.id]);

  // Initialize word on first play
  useEffect(() => {
    if (game.status === 'playing' && !gameData.word && isPlayerX) {
      const randomWord = WORDS[Math.floor(Math.random() * WORDS.length)];
      supabase.from('games').update({
        game_data: { ...gameData, word: randomWord, guessed_letters: [], wrong_guesses: 0, player_x_score: 0, player_o_score: 0 },
      }).eq('id', game.id);
    }
  }, [game.status]);

  const handleGuess = async (letter: string) => {
    if (!isMyTurn || isSolved || isHanged || game.winner) return;
    letter = letter.toUpperCase();
    if (!/^[A-ZÄÖÜ]$/.test(letter) || guessedLetters.includes(letter)) return;

    const newGuessed = [...guessedLetters, letter];
    const isCorrect = word.includes(letter);
    const newWrong = isCorrect ? wrongGuesses : wrongGuesses + 1;

    const newGameData = {
      ...gameData,
      guessed_letters: newGuessed,
      wrong_guesses: newWrong,
    };

    const update: Record<string, unknown> = {
      game_data: newGameData,
      current_turn: isPlayerX ? game.player_o : game.player_x,
    };

    // Check win/lose
    const solved = word.split('').every(l => newGuessed.includes(l));
    if (solved) {
      // Current player wins the round
      const scoreKey = isPlayerX ? 'player_x_score' : 'player_o_score';
      newGameData[scoreKey] = (isPlayerX ? playerXScore : playerOScore) + 1;
      update.game_data = newGameData;
    }
    if (newWrong >= MAX_WRONG) {
      update.status = 'finished';
      // Other player wins
      update.winner = isPlayerX ? game.player_o : game.player_x;
    }

    await supabase.from('games').update(update).eq('id', game.id);
    setLetterInput('');
  };

  const handleLetterClick = (letter: string) => handleGuess(letter);

  const handleReset = async () => {
    const randomWord = WORDS[Math.floor(Math.random() * WORDS.length)];
    await supabase.from('games').update({
      game_data: { ...gameData, word: randomWord, guessed_letters: [], wrong_guesses: 0 },
      winner: null, is_draw: false, status: 'playing' as any, current_turn: game.player_x,
    }).eq('id', game.id);
  };

  const handleLeave = async () => {
    const otherPlayer = isPlayerX ? game.player_o : game.player_x;
    if (!otherPlayer) await supabase.from('games').delete().eq('id', game.id);
    else await supabase.from('games').update({ status: 'finished' as any }).eq('id', game.id);
    onLeave();
  };

  const getStatusText = () => {
    if (game.status === 'waiting') return 'Warte auf Mitspieler…';
    if (isSolved) return '🎉 Wort gelöst!';
    if (isHanged) return `💀 Aufgehängt! Das Wort war: ${word}`;
    if (game.winner === userId) return '🎉 Du hast gewonnen!';
    if (game.winner) return 'Du hast verloren.';
    if (isMyTurn) return 'Dein Buchstabe!';
    return 'Gegner rät…';
  };

  // Hangman drawing parts
  const hangmanParts = [
    <circle key="head" cx="50" cy="25" r="10" stroke="currentColor" strokeWidth="2" fill="none" />,
    <line key="body" x1="50" y1="35" x2="50" y2="60" stroke="currentColor" strokeWidth="2" />,
    <line key="larm" x1="50" y1="40" x2="35" y2="50" stroke="currentColor" strokeWidth="2" />,
    <line key="rarm" x1="50" y1="40" x2="65" y2="50" stroke="currentColor" strokeWidth="2" />,
    <line key="lleg" x1="50" y1="60" x2="38" y2="75" stroke="currentColor" strokeWidth="2" />,
    <line key="rleg" x1="50" y1="60" x2="62" y2="75" stroke="currentColor" strokeWidth="2" />,
  ];

  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="border-b border-border px-4 py-3 flex items-center justify-between bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={handleLeave} className="text-muted-foreground">
            <ArrowLeft className="w-4 h-4 mr-1" /> Lobby
          </Button>
          <span className="text-sm font-semibold text-foreground">Wortspiel (Hangman)</span>
        </div>
        <span className="text-[10px] text-muted-foreground font-mono">{game.id.slice(0, 8)}</span>
      </header>

      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        <main className="flex-1 flex flex-col items-center p-4 gap-4 overflow-y-auto">
          <div className={`text-sm font-medium px-4 py-2 rounded-full animate-fade-in ${
            isSolved || game.winner === userId ? 'bg-primary/15 text-primary' :
            isHanged || (game.winner && game.winner !== userId) ? 'bg-destructive/15 text-destructive' :
            isMyTurn ? 'bg-primary/10 text-primary animate-pulse-glow' :
            'bg-secondary text-muted-foreground'
          }`}>
            {(isSolved || game.winner === userId) && <Trophy className="w-4 h-4 inline mr-1" />}
            {getStatusText()}
          </div>

          {/* Hangman drawing */}
          <div className="animate-fade-in-up">
            <svg width="100" height="90" className="text-foreground">
              {/* Gallows */}
              <line x1="10" y1="85" x2="90" y2="85" stroke="currentColor" strokeWidth="2" />
              <line x1="30" y1="85" x2="30" y2="5" stroke="currentColor" strokeWidth="2" />
              <line x1="30" y1="5" x2="50" y2="5" stroke="currentColor" strokeWidth="2" />
              <line x1="50" y1="5" x2="50" y2="15" stroke="currentColor" strokeWidth="2" />
              {/* Body parts */}
              {hangmanParts.slice(0, wrongGuesses)}
            </svg>
          </div>

          {/* Word display */}
          <div className="flex gap-2 flex-wrap justify-center animate-fade-in-up">
            {word.split('').map((letter, i) => (
              <div
                key={i}
                className={`w-9 h-11 flex items-center justify-center border-b-2 text-lg font-bold
                  ${guessedLetters.includes(letter) ? 'text-foreground border-primary' : 'border-muted-foreground/30'}
                  ${isHanged && !guessedLetters.includes(letter) ? 'text-destructive' : ''}
                `}
              >
                {(guessedLetters.includes(letter) || isHanged) ? letter : ''}
              </div>
            ))}
          </div>

          {/* Wrong count */}
          <p className="text-xs text-muted-foreground">
            Fehlversuche: {wrongGuesses}/{MAX_WRONG}
          </p>

          {/* Letter keyboard */}
          {game.status === 'playing' && !isSolved && !isHanged && (
            <div className="w-full max-w-md animate-fade-in-up">
              <div className="flex flex-wrap gap-1 justify-center">
                {alphabet.map(letter => {
                  const used = guessedLetters.includes(letter);
                  const isCorrect = used && word.includes(letter);
                  const isWrong = used && !word.includes(letter);
                  return (
                    <button
                      key={letter}
                      onClick={() => handleLetterClick(letter)}
                      disabled={used || !isMyTurn}
                      className={`w-8 h-8 rounded-lg text-xs font-bold transition-all active:scale-95
                        ${isCorrect ? 'bg-[hsl(var(--success)/0.2)] text-[hsl(var(--success))]' :
                          isWrong ? 'bg-destructive/15 text-destructive/50' :
                          isMyTurn ? 'bg-secondary hover:bg-primary/15 hover:text-primary cursor-pointer' :
                          'bg-secondary/50 text-muted-foreground/50'}
                      `}
                    >
                      {letter}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {(game.status === 'finished' || isSolved || isHanged) && (
            <div className="flex gap-2 animate-fade-in-up">
              <Button onClick={handleReset} className="gap-2"><RotateCcw className="w-4 h-4" /> Neues Wort</Button>
              <Button variant="secondary" onClick={handleLeave}>Zur Lobby</Button>
            </div>
          )}

          {game.status === 'waiting' && (
            <div className="text-center animate-fade-in space-y-2">
              <p className="text-sm text-muted-foreground">Teile diese Spiel-ID:</p>
              <code className="block bg-secondary rounded-lg px-4 py-2 text-xs font-mono text-foreground select-all">{game.id}</code>
            </div>
          )}
        </main>

        {game.status !== 'waiting' && (
          <aside className="w-full lg:w-72 border-t lg:border-t-0 lg:border-l border-border h-48 lg:h-auto flex flex-col bg-card/30">
            <ChatPanel userId={userId} gameId={game.id} title="Spiel Chat" />
          </aside>
        )}
      </div>
    </div>
  );
}
