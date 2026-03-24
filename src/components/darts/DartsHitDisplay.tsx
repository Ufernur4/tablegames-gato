import { motion, AnimatePresence } from 'framer-motion';

interface DartsHitDisplayProps {
  lastHit: { points: number; label: string } | null;
  error: string;
}

export function DartsHitDisplay({ lastHit, error }: DartsHitDisplayProps) {
  return (
    <>
      <AnimatePresence>
        {lastHit && (
          <motion.div
            key={lastHit.label}
            initial={{ scale: 0, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.5, opacity: 0, y: -20 }}
            transition={{ type: 'spring', stiffness: 400, damping: 15 }}
            className="text-center"
          >
            <div className={`text-3xl font-black tracking-tight ${
              lastHit.points >= 50 ? 'text-primary glow-neon-cyan' :
              lastHit.points >= 25 ? 'text-primary' :
              lastHit.points === 0 ? 'text-destructive' :
              'text-foreground'
            }`}>
              {lastHit.points > 0 ? `+${lastHit.points}` : '0'}
            </div>
            <div className={`text-xs font-semibold mt-0.5 ${
              lastHit.points >= 25 ? 'text-primary/80' : 'text-muted-foreground'
            }`}>
              {lastHit.label}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="rounded-xl bg-destructive/10 border border-destructive/20 px-4 py-2 text-xs text-destructive font-medium max-w-xs text-center"
          >
            {error}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
