import { motion } from 'framer-motion';

interface PinLayout { x: number; y: number }
interface Particle { id: number; x: number; y: number; vx: number; vy: number; life: number; color: string; size: number }

interface BowlingLaneProps {
  pinLayout: PinLayout[];
  previouslyFallen: Set<number>;
  fallenPins: Set<number>;
  pinFallAngles: Record<number, { angle: number; dx: number; dy: number }>;
  particles: Particle[];
  ballPos: { x: number; y: number } | null;
  ballRotation: number;
  ballX: number;
  isRolling: boolean;
  isDragging: boolean;
  isMyTurn: boolean;
  spinAngle: number;
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
}

export function BowlingLane({
  pinLayout, previouslyFallen, fallenPins, pinFallAngles, particles,
  ballPos, ballRotation, ballX, isRolling, isDragging, isMyTurn, spinAngle,
  onPointerDown, onPointerMove, onPointerUp,
}: BowlingLaneProps) {
  return (
    <div className="relative w-full max-w-[300px] touch-none select-none"
      style={{ perspective: '600px' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}>
      <svg viewBox="0 0 200 340" className="w-full"
        style={{
          transform: 'rotateX(8deg)',
          transformOrigin: '50% 100%',
          filter: 'drop-shadow(0 15px 40px rgba(0,0,0,0.7))',
        }}>
        <defs>
          <linearGradient id="b-lane" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#3d2a1a" />
            <stop offset="15%" stopColor="#5a3d28" />
            <stop offset="50%" stopColor="#7a5438" />
            <stop offset="85%" stopColor="#5a3d28" />
            <stop offset="100%" stopColor="#3d2a1a" />
          </linearGradient>
          <linearGradient id="b-gutter" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#111" />
            <stop offset="100%" stopColor="#0a0a0a" />
          </linearGradient>
          <radialGradient id="b-ball" cx="35%" cy="30%">
            <stop offset="0%" stopColor="#33ddff" />
            <stop offset="40%" stopColor="#0099cc" />
            <stop offset="100%" stopColor="#004466" />
          </radialGradient>
          <radialGradient id="b-ball-bot" cx="35%" cy="30%">
            <stop offset="0%" stopColor="#ff6666" />
            <stop offset="40%" stopColor="#cc3333" />
            <stop offset="100%" stopColor="#661111" />
          </radialGradient>
          <linearGradient id="b-shine" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(255,255,255,0.08)" />
            <stop offset="40%" stopColor="rgba(255,255,255,0.02)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0)" />
          </linearGradient>
        </defs>

        {/* Gutters */}
        <rect x="0" y="0" width="28" height="340" fill="url(#b-gutter)" />
        <rect x="172" y="0" width="28" height="340" fill="url(#b-gutter)" />
        <line x1="28" y1="0" x2="28" y2="340" stroke="#222" strokeWidth="1" />
        <line x1="172" y1="0" x2="172" y2="340" stroke="#222" strokeWidth="1" />

        {/* Lane */}
        <rect x="28" y="0" width="144" height="340" fill="url(#b-lane)" />
        <rect x="28" y="0" width="144" height="340" fill="url(#b-shine)" />

        {/* Plank lines */}
        {[46, 64, 82, 100, 118, 136, 154].map(x => (
          <line key={x} x1={x} y1="0" x2={x} y2="340" stroke="rgba(0,0,0,0.15)" strokeWidth="0.5" />
        ))}

        {/* Oil pattern */}
        <rect x="40" y="80" width="120" height="120" fill="rgba(255,255,255,0.03)" rx="4" />

        {/* Arrows */}
        {[60, 80, 100, 120, 140].map((x, i) => (
          <polygon key={`arr-${x}`} points={`${x},195 ${x - 5},210 ${x + 5},210`}
            fill={i === 2 ? '#00D9FF' : '#888'} opacity="0.25" />
        ))}

        {/* Approach dots */}
        {[60, 80, 100, 120, 140].map(x => (
          <circle key={`dot-${x}`} cx={x} cy="270" r="1.5" fill="#666" opacity="0.4" />
        ))}

        {/* Foul line */}
        <line x1="28" y1="240" x2="172" y2="240" stroke="#cc3333" strokeWidth="2" opacity="0.5" />

        {/* Pin deck */}
        <rect x="42" y="6" width="116" height="68" fill="#ddd" rx="3" opacity="0.12" />

        {/* Pins */}
        {pinLayout.map((pin, i) => {
          const isFallen = fallenPins.has(i) || previouslyFallen.has(i);
          const fall = pinFallAngles[i];
          if (previouslyFallen.has(i)) return null;
          return (
            <g key={i}>
              {!isFallen ? (
                <g>
                  <ellipse cx={pin.x + 1} cy={pin.y + 9} rx="3.5" ry="1.2" fill="rgba(0,0,0,0.25)" />
                  <ellipse cx={pin.x} cy={pin.y + 5} rx="3.2" ry="4" fill="#f0ece6" />
                  <ellipse cx={pin.x} cy={pin.y} rx="2.3" ry="2.5" fill="#f5f0e8" />
                  <rect x={pin.x - 1.3} y={pin.y + 1} width="2.6" height="2.5" fill="#f0ece6" />
                  <ellipse cx={pin.x} cy={pin.y - 0.5} rx="2.3" ry="0.8" fill="#cc2222" opacity="0.8" />
                  <ellipse cx={pin.x} cy={pin.y + 1} rx="2" ry="0.5" fill="#cc2222" opacity="0.5" />
                  <ellipse cx={pin.x - 0.8} cy={pin.y - 1} rx="0.8" ry="1.2" fill="rgba(255,255,255,0.3)" />
                </g>
              ) : fall && (
                <motion.g
                  initial={{ rotate: 0, x: 0, y: 0, opacity: 1 }}
                  animate={{ rotate: fall.angle, x: fall.dx, y: fall.dy + 5, opacity: 0.2 }}
                  transition={{ duration: 0.6, ease: 'easeOut' }}
                  style={{ originX: `${pin.x}px`, originY: `${pin.y}px` }}>
                  <ellipse cx={pin.x} cy={pin.y + 3} rx="2.8" ry="3.5" fill="#d5d0c5" />
                  <ellipse cx={pin.x} cy={pin.y - 1} rx="2" ry="2" fill="#d5d0c5" />
                </motion.g>
              )}
            </g>
          );
        })}

        {/* Particles */}
        {particles.map(p => (
          <circle key={p.id} cx={p.x} cy={p.y} r={p.size * (p.life / 40)}
            fill={p.color} opacity={Math.min(p.life / 20, 1)} />
        ))}

        {/* Rolling ball */}
        {ballPos && (
          <g>
            <ellipse cx={ballPos.x} cy={ballPos.y + 7} rx={6 + (1 - ballPos.y / 300) * 2} ry="2.5"
              fill="rgba(0,0,0,0.3)" />
            <circle cx={ballPos.x} cy={ballPos.y} r={7 + (1 - ballPos.y / 300) * 1.5}
              fill={isMyTurn ? "url(#b-ball)" : "url(#b-ball-bot)"} stroke={isMyTurn ? "rgba(0,217,255,0.3)" : "rgba(255,100,100,0.3)"} strokeWidth="0.5" />
            <g transform={`rotate(${ballRotation}, ${ballPos.x}, ${ballPos.y})`}>
              <circle cx={ballPos.x - 2} cy={ballPos.y - 2} r="1" fill="rgba(0,0,0,0.5)" />
              <circle cx={ballPos.x + 2} cy={ballPos.y - 2} r="1" fill="rgba(0,0,0,0.5)" />
              <circle cx={ballPos.x} cy={ballPos.y + 1.5} r="0.8" fill="rgba(0,0,0,0.5)" />
            </g>
            <line x1={ballPos.x} y1={ballPos.y + 10} x2={ballPos.x} y2={Math.min(ballPos.y + 30, 310)}
              stroke={isMyTurn ? "rgba(0,217,255,0.15)" : "rgba(255,100,100,0.15)"} strokeWidth="3" strokeLinecap="round" />
          </g>
        )}

        {/* Ball at rest */}
        {!isRolling && isMyTurn && (
          <g>
            <ellipse cx={ballX} cy={298} rx="7" ry="2.5" fill="rgba(0,0,0,0.3)" />
            <circle cx={ballX} cy={290} r="9" fill="url(#b-ball)"
              stroke={isDragging ? 'rgba(0,217,255,0.6)' : 'rgba(0,217,255,0.2)'} strokeWidth="1"
              style={{ filter: isDragging ? 'drop-shadow(0 0 12px rgba(0,217,255,0.4))' : 'none' }}>
              {isDragging && <animate attributeName="r" values="9;10;9" dur="0.4s" repeatCount="indefinite" />}
            </circle>
            <circle cx={ballX - 2} cy={288} r="1.3" fill="rgba(0,0,0,0.4)" />
            <circle cx={ballX + 2} cy={288} r="1.3" fill="rgba(0,0,0,0.4)" />
            <circle cx={ballX} cy={291.5} r="1" fill="rgba(0,0,0,0.4)" />
          </g>
        )}

        {/* Aim line */}
        {isDragging && (
          <>
            <line x1={ballX} y1={285} x2={ballX + spinAngle * 25} y2={50}
              stroke="rgba(0,217,255,0.25)" strokeWidth="1" strokeDasharray="4,4" />
            <circle cx={ballX + spinAngle * 25} cy={50} r="3" fill="rgba(0,217,255,0.15)" />
          </>
        )}
      </svg>

      {/* Touch instruction */}
      {isMyTurn && !isRolling && !isDragging && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: [0.4, 0.8, 0.4] }}
          transition={{ repeat: Infinity, duration: 2 }}
          className="absolute bottom-4 left-0 right-0 text-center pointer-events-none">
          <p className="text-[11px] text-primary/60 font-medium">
            ↑ Kugel greifen & nach oben wischen
          </p>
        </motion.div>
      )}
    </div>
  );
}
