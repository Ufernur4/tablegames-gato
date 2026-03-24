import { motion } from 'framer-motion';
import { Trophy } from 'lucide-react';

interface DartsScoreboardProps {
  myScore: number;
  opponentScore: number;
  isMyTurn: boolean;
  dartsLeft: number;
  isWinner: boolean;
  isLoser: boolean;
  isWaiting: boolean;
  statusText: string;
}

export function DartsScoreboard({ myScore, opponentScore, isMyTurn, dartsLeft, isWinner, isLoser, isWaiting, statusText }: DartsScoreboardProps) {
  return (
    <div className="w-full max-w-md space-y-3">
      {/* Score cards */}
      <div className="flex gap-3">
        <motion.div
          animate={{ scale: isMyTurn ? 1.02 : 1 }}
          className={`flex-1 rounded-2xl p-3 text-center transition-all duration-300 ${
            isMyTurn 
              ? 'bg-primary/10 border-2 border-primary/40 glow-primary-sm' 
              : 'glass-card'
          }`}
        >
          <p className="text-[10px] text-muted-foreground uppercase tracking-[0.2em] mb-0.5 font-semibold">Du</p>
          <p className="text-4xl font-black text-foreground tabular-nums tracking-tight">{myScore}</p>
          {isMyTurn && (
            <div className="flex justify-center gap-1.5 mt-2">
              {[0, 1, 2].map(i => (
                <motion.div
                  key={i}
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${
                    i < (3 - dartsLeft) ? 'bg-primary glow-primary-sm' : 'bg-secondary'
                  }`}
                />
              ))}
            </div>
          )}
        </motion.div>
        
        <div className="flex items-center">
          <span className="text-xs font-black text-muted-foreground/50 tracking-widest">VS</span>
        </div>
        
        <div className="flex-1 glass-card rounded-2xl p-3 text-center">
          <p className="text-[10px] text-muted-foreground uppercase tracking-[0.2em] mb-0.5 font-semibold">Gegner</p>
          <p className="text-4xl font-black text-foreground tabular-nums tracking-tight">{opponentScore}</p>
        </div>
      </div>

      {/* Status badge */}
      <motion.div
        key={statusText}
        initial={{ opacity: 0, y: -8, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        className={`text-center text-sm font-bold px-5 py-2 rounded-full mx-auto w-fit ${
          isWinner ? 'bg-primary/15 text-primary glow-primary' :
          isLoser ? 'bg-destructive/15 text-destructive' :
          isMyTurn ? 'bg-primary/10 text-primary' :
          'glass-card text-muted-foreground'
        }`}
      >
        {isWinner && <Trophy className="w-4 h-4 inline mr-1.5 -mt-0.5" />}
        {statusText}
      </motion.div>
    </div>
  );
}
