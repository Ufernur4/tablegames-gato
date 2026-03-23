import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Game } from '@/hooks/useGames';
import { ChatPanel } from '@/components/ChatPanel';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Trophy, RotateCcw } from 'lucide-react';

interface TriviaProps {
  game: Game;
  userId: string;
  onLeave: () => void;
}

type Question = {
  question: string;
  answers: string[];
  correct: number;
  category: string;
};

// German trivia questions bank
const QUESTIONS: Question[] = [
  { question: 'Welches ist das größte Land der Welt?', answers: ['China', 'USA', 'Russland', 'Kanada'], correct: 2, category: 'Geografie' },
  { question: 'Wie viele Planeten hat unser Sonnensystem?', answers: ['7', '8', '9', '10'], correct: 1, category: 'Wissenschaft' },
  { question: 'Wer malte die Mona Lisa?', answers: ['Michelangelo', 'Da Vinci', 'Picasso', 'Van Gogh'], correct: 1, category: 'Kunst' },
  { question: 'In welchem Jahr fiel die Berliner Mauer?', answers: ['1987', '1989', '1990', '1991'], correct: 1, category: 'Geschichte' },
  { question: 'Welches Element hat das Symbol "O"?', answers: ['Gold', 'Osmium', 'Sauerstoff', 'Zink'], correct: 2, category: 'Wissenschaft' },
  { question: 'Wie heißt die Hauptstadt von Australien?', answers: ['Sydney', 'Melbourne', 'Canberra', 'Perth'], correct: 2, category: 'Geografie' },
  { question: 'Wie viele Seiten hat ein Hexagon?', answers: ['5', '6', '7', '8'], correct: 1, category: 'Mathe' },
  { question: 'Welches Tier ist das schnellste der Welt?', answers: ['Leopard', 'Gepard', 'Falke', 'Windhund'], correct: 1, category: 'Natur' },
  { question: 'In welchem Land steht die Freiheitsstatue?', answers: ['Frankreich', 'England', 'USA', 'Kanada'], correct: 2, category: 'Geografie' },
  { question: 'Wie viele Zähne hat ein erwachsener Mensch?', answers: ['28', '30', '32', '34'], correct: 2, category: 'Wissenschaft' },
  { question: 'Welche Farbe hat ein Smaragd?', answers: ['Blau', 'Rot', 'Grün', 'Gelb'], correct: 2, category: 'Allgemein' },
  { question: 'Wer schrieb "Faust"?', answers: ['Schiller', 'Goethe', 'Kafka', 'Hesse'], correct: 1, category: 'Literatur' },
  { question: 'Wie heißt der längste Fluss der Welt?', answers: ['Amazonas', 'Nil', 'Jangtse', 'Mississippi'], correct: 1, category: 'Geografie' },
  { question: 'Welches Gas atmen Pflanzen ein?', answers: ['Sauerstoff', 'Stickstoff', 'CO2', 'Helium'], correct: 2, category: 'Wissenschaft' },
  { question: 'Wie viele Kontinente gibt es?', answers: ['5', '6', '7', '8'], correct: 2, category: 'Geografie' },
  { question: 'Welcher Planet ist der Sonne am nächsten?', answers: ['Venus', 'Mars', 'Merkur', 'Erde'], correct: 2, category: 'Wissenschaft' },
  { question: 'Was ist die Quadratwurzel von 144?', answers: ['10', '11', '12', '14'], correct: 2, category: 'Mathe' },
  { question: 'In welchem Land wurden die Olympischen Spiele erfunden?', answers: ['Italien', 'Griechenland', 'Ägypten', 'China'], correct: 1, category: 'Geschichte' },
  { question: 'Wie heißt das kleinste Land der Welt?', answers: ['Monaco', 'Vatikan', 'San Marino', 'Liechtenstein'], correct: 1, category: 'Geografie' },
  { question: 'Welches Instrument hat 88 Tasten?', answers: ['Gitarre', 'Klavier', 'Orgel', 'Akkordeon'], correct: 1, category: 'Musik' },
];

export function Trivia({ game: initialGame, userId, onLeave }: TriviaProps) {
  const [game, setGame] = useState<Game>(initialGame);
  const [error, setError] = useState('');

  const gameData = (game.game_data || {}) as Record<string, any>;
  const isPlayerX = game.player_x === userId;
  const currentQuestionIdx = gameData.current_question ?? 0;
  const totalQuestions = gameData.total_questions ?? 10;
  const playerXScore = gameData.player_x_score ?? 0;
  const playerOScore = gameData.player_o_score ?? 0;
  const answered = gameData.answered_by ?? null;
  const selectedAnswer = gameData.selected_answer ?? null;
  const isMyTurn = game.current_turn === userId;

  // Get shuffled questions from game_data or generate
  const questionOrder: number[] = gameData.question_order || 
    Array.from({ length: QUESTIONS.length }, (_, i) => i).sort(() => Math.random() - 0.5).slice(0, totalQuestions);

  const currentQ = currentQuestionIdx < questionOrder.length ? QUESTIONS[questionOrder[currentQuestionIdx]] : null;

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

  // Initialize question order on first load
  useEffect(() => {
    if (game.status === 'playing' && !gameData.question_order && isPlayerX) {
      const order = Array.from({ length: QUESTIONS.length }, (_, i) => i)
        .sort(() => Math.random() - 0.5).slice(0, totalQuestions);
      supabase.from('games').update({
        game_data: { ...gameData, question_order: order, current_question: 0, player_x_score: 0, player_o_score: 0 },
      }).eq('id', game.id);
    }
  }, [game.status]);

  const handleAnswer = async (answerIdx: number) => {
    if (!isMyTurn || !currentQ || game.winner) return;
    
    const isCorrect = answerIdx === currentQ.correct;
    const scoreKey = isPlayerX ? 'player_x_score' : 'player_o_score';
    const currentScore = isPlayerX ? playerXScore : playerOScore;

    const nextQuestion = currentQuestionIdx + 1;
    const isLastQuestion = nextQuestion >= questionOrder.length;

    const newGameData = {
      ...gameData,
      question_order: questionOrder,
      [scoreKey]: isCorrect ? currentScore + 1 : currentScore,
      selected_answer: answerIdx,
      answered_by: userId,
    };

    // Show answer briefly, then move to next
    await supabase.from('games').update({
      game_data: newGameData,
    }).eq('id', game.id);

    // After delay, advance
    setTimeout(async () => {
      const finalXScore = isPlayerX ? (isCorrect ? currentScore + 1 : currentScore) : playerXScore;
      const finalOScore = !isPlayerX ? (isCorrect ? currentScore + 1 : currentScore) : playerOScore;

      if (isLastQuestion && !isPlayerX) {
        // Both answered all - determine winner
        const update: Record<string, unknown> = {
          game_data: { ...newGameData, current_question: nextQuestion, selected_answer: null, answered_by: null },
          status: 'finished',
        };
        if (finalXScore > finalOScore) update.winner = game.player_x;
        else if (finalOScore > finalXScore) update.winner = game.player_o;
        else update.is_draw = true;
        await supabase.from('games').update(update).eq('id', game.id);
      } else {
        await supabase.from('games').update({
          game_data: { ...newGameData, current_question: isPlayerX ? currentQuestionIdx : nextQuestion, selected_answer: null, answered_by: null },
          current_turn: isPlayerX ? game.player_o : game.player_x,
        }).eq('id', game.id);
      }
    }, 1500);
  };

  const handleReset = async () => {
    const order = Array.from({ length: QUESTIONS.length }, (_, i) => i)
      .sort(() => Math.random() - 0.5).slice(0, 10);
    await supabase.from('games').update({
      game_data: { question_order: order, current_question: 0, player_x_score: 0, player_o_score: 0, total_questions: 10 },
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
    if (game.winner === userId) return '🎉 Du hast gewonnen!';
    if (game.winner) return 'Du hast verloren.';
    if (game.is_draw) return 'Unentschieden!';
    if (isMyTurn) return 'Deine Frage!';
    return 'Gegner antwortet…';
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="border-b border-border px-4 py-3 flex items-center justify-between bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={handleLeave} className="text-muted-foreground">
            <ArrowLeft className="w-4 h-4 mr-1" /> Lobby
          </Button>
          <span className="text-sm font-semibold text-foreground">Trivia Quiz</span>
        </div>
        <span className="text-[10px] text-muted-foreground font-mono">{game.id.slice(0, 8)}</span>
      </header>

      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        <main className="flex-1 flex flex-col items-center p-4 gap-4 overflow-y-auto">
          {/* Scores */}
          <div className="flex gap-4 w-full max-w-md animate-fade-in-up">
            <div className={`flex-1 game-card text-center ${isPlayerX ? 'border-primary/30' : ''}`}>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Du</p>
              <p className="text-3xl font-bold text-foreground tabular-nums">{isPlayerX ? playerXScore : playerOScore}</p>
            </div>
            <div className={`flex-1 game-card text-center ${!isPlayerX ? 'border-primary/30' : ''}`}>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Gegner</p>
              <p className="text-3xl font-bold text-foreground tabular-nums">{isPlayerX ? playerOScore : playerXScore}</p>
            </div>
          </div>

          <div className={`text-sm font-medium px-4 py-2 rounded-full animate-fade-in ${
            game.winner === userId ? 'bg-primary/15 text-primary' :
            game.winner ? 'bg-destructive/15 text-destructive' :
            game.is_draw ? 'bg-secondary text-muted-foreground' :
            isMyTurn ? 'bg-primary/10 text-primary animate-pulse-glow' :
            'bg-secondary text-muted-foreground'
          }`}>
            {game.winner && <Trophy className="w-4 h-4 inline mr-1" />}
            {getStatusText()}
          </div>

          {/* Progress */}
          {game.status === 'playing' && (
            <div className="w-full max-w-md">
              <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                <span>Frage {Math.min(currentQuestionIdx + 1, questionOrder.length)}/{questionOrder.length}</span>
                {currentQ && <span className="bg-secondary rounded-full px-2 py-0.5">{currentQ.category}</span>}
              </div>
              <div className="w-full h-1.5 bg-secondary rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-500"
                  style={{ width: `${((currentQuestionIdx) / questionOrder.length) * 100}%` }}
                />
              </div>
            </div>
          )}

          {/* Question */}
          {game.status === 'playing' && currentQ && !game.winner && (
            <div className="w-full max-w-md space-y-3 animate-fade-in-up">
              <div className="game-card">
                <p className="text-sm font-medium text-foreground text-center">{currentQ.question}</p>
              </div>
              <div className="grid grid-cols-1 gap-2">
                {currentQ.answers.map((answer, idx) => {
                  const isSelected = selectedAnswer === idx && answered;
                  const isCorrectAnswer = idx === currentQ.correct;
                  const showResult = answered !== null;

                  return (
                    <button
                      key={idx}
                      onClick={() => handleAnswer(idx)}
                      disabled={!isMyTurn || answered !== null}
                      className={`text-left px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 active:scale-98
                        ${showResult && isCorrectAnswer ? 'bg-[hsl(var(--success)/0.2)] text-[hsl(var(--success))] border border-[hsl(var(--success)/0.3)]' :
                          showResult && isSelected && !isCorrectAnswer ? 'bg-destructive/15 text-destructive border border-destructive/30' :
                          isMyTurn ? 'bg-secondary hover:bg-primary/10 hover:text-primary cursor-pointer border border-transparent' :
                          'bg-secondary/50 text-muted-foreground border border-transparent'}
                      `}
                    >
                      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-background/50 text-xs mr-2">
                        {String.fromCharCode(65 + idx)}
                      </span>
                      {answer}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {game.status === 'finished' && (
            <div className="flex gap-2 animate-fade-in-up">
              <Button onClick={handleReset} className="gap-2"><RotateCcw className="w-4 h-4" /> Neues Quiz</Button>
              <Button variant="secondary" onClick={handleLeave}>Zur Lobby</Button>
            </div>
          )}

          {game.status === 'waiting' && (
            <div className="text-center animate-fade-in space-y-2">
              <p className="text-sm text-muted-foreground">Teile diese Spiel-ID:</p>
              <code className="block bg-secondary rounded-lg px-4 py-2 text-xs font-mono text-foreground select-all">{game.id}</code>
            </div>
          )}

          {error && <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-xs text-destructive animate-fade-in max-w-sm">{error}</div>}
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
