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
    <div className="relative w-full max-w-[340px] touch-none select-none"
      style={{ perspective: '800px' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}>
      <svg viewBox="0 0 200 380" className="w-full"
        style={{
          transform: 'rotateX(12deg)',
          transformOrigin: '50% 100%',
          filter: 'drop-shadow(0 20px 60px rgba(0,0,0,0.8))',
        }}>
        <defs>
          {/* Premium wood grain gradient */}
          <linearGradient id="bl-lane" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#2a1a0a" />
            <stop offset="8%" stopColor="#4a2d15" />
            <stop offset="20%" stopColor="#6b4423" />
            <stop offset="35%" stopColor="#8b5e34" />
            <stop offset="50%" stopColor="#9a6b3d" />
            <stop offset="65%" stopColor="#8b5e34" />
            <stop offset="80%" stopColor="#6b4423" />
            <stop offset="92%" stopColor="#4a2d15" />
            <stop offset="100%" stopColor="#2a1a0a" />
          </linearGradient>
          {/* Gutter gradient */}
          <linearGradient id="bl-gutter" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#080808" />
            <stop offset="50%" stopColor="#151515" />
            <stop offset="100%" stopColor="#080808" />
          </linearGradient>
          {/* Lane shine */}
          <linearGradient id="bl-shine" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(255,255,255,0.06)" />
            <stop offset="30%" stopColor="rgba(255,255,255,0.02)" />
            <stop offset="60%" stopColor="rgba(255,255,255,0)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0.01)" />
          </linearGradient>
          {/* Oil pattern sheen */}
          <linearGradient id="bl-oil" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(255,255,255,0)" />
            <stop offset="20%" stopColor="rgba(200,220,255,0.04)" />
            <stop offset="60%" stopColor="rgba(200,220,255,0.06)" />
            <stop offset="80%" stopColor="rgba(200,220,255,0.02)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0)" />
          </linearGradient>
          {/* Player ball */}
          <radialGradient id="bl-ball" cx="35%" cy="28%">
            <stop offset="0%" stopColor="#55eeff" />
            <stop offset="30%" stopColor="#00ccee" />
            <stop offset="70%" stopColor="#0088aa" />
            <stop offset="100%" stopColor="#004455" />
          </radialGradient>
          {/* Bot ball */}
          <radialGradient id="bl-ball-bot" cx="35%" cy="28%">
            <stop offset="0%" stopColor="#ff7777" />
            <stop offset="30%" stopColor="#dd4444" />
            <stop offset="70%" stopColor="#aa2222" />
            <stop offset="100%" stopColor="#661111" />
          </radialGradient>
          {/* Pin deck */}
          <linearGradient id="bl-deck" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#c8bda8" />
            <stop offset="100%" stopColor="#a89880" />
          </linearGradient>
          {/* Approach area */}
          <linearGradient id="bl-approach" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#7a5438" />
            <stop offset="100%" stopColor="#5a3d28" />
          </linearGradient>
          {/* Pin body gradient */}
          <radialGradient id="bl-pin-body" cx="45%" cy="35%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="50%" stopColor="#f5f0e8" />
            <stop offset="100%" stopColor="#d5cec2" />
          </radialGradient>
        </defs>

        {/* Background - dark behind everything */}
        <rect x="0" y="0" width="200" height="380" fill="#0a0a0a" />

        {/* Left gutter */}
        <rect x="8" y="0" width="20" height="340" fill="url(#bl-gutter)" rx="0" />
        <rect x="8" y="0" width="20" height="340" fill="rgba(0,0,0,0.3)" />
        {/* Gutter inner shadow */}
        <rect x="8" y="0" width="5" height="340" fill="rgba(0,0,0,0.4)" />

        {/* Right gutter */}
        <rect x="172" y="0" width="20" height="340" fill="url(#bl-gutter)" rx="0" />
        <rect x="172" y="0" width="20" height="340" fill="rgba(0,0,0,0.3)" />
        <rect x="187" y="0" width="5" height="340" fill="rgba(0,0,0,0.4)" />

        {/* Lane surface */}
        <rect x="28" y="0" width="144" height="340" fill="url(#bl-lane)" />
        <rect x="28" y="0" width="144" height="340" fill="url(#bl-shine)" />
        <rect x="28" y="60" width="144" height="180" fill="url(#bl-oil)" />

        {/* Wood plank lines */}
        {[40, 52, 64, 76, 88, 100, 112, 124, 136, 148, 160].map(x => (
          <line key={x} x1={x} y1="0" x2={x} y2="340" stroke="rgba(0,0,0,0.12)" strokeWidth="0.3" />
        ))}

        {/* Lane borders (chrome rails) */}
        <line x1="28" y1="0" x2="28" y2="340" stroke="#333" strokeWidth="1.5" />
        <line x1="172" y1="0" x2="172" y2="340" stroke="#333" strokeWidth="1.5" />
        <line x1="28.5" y1="0" x2="28.5" y2="340" stroke="rgba(255,255,255,0.08)" strokeWidth="0.5" />
        <line x1="171.5" y1="0" x2="171.5" y2="340" stroke="rgba(255,255,255,0.08)" strokeWidth="0.5" />

        {/* Pin deck area */}
        <rect x="38" y="4" width="124" height="78" fill="url(#bl-deck)" rx="4" opacity="0.15" />
        <rect x="38" y="4" width="124" height="78" fill="rgba(255,255,255,0.03)" rx="4" />

        {/* Arrows (Plato-style triangles) */}
        {[56, 72, 100, 128, 144].map((x, i) => (
          <polygon key={`arr-${x}`}
            points={`${x},200 ${x - 4},212 ${x + 4},212`}
            fill={i === 2 ? '#00D9FF' : '#666'}
            opacity={i === 2 ? 0.4 : 0.2}
          />
        ))}

        {/* Range dots row 1 */}
        {[56, 72, 88, 100, 112, 128, 144].map(x => (
          <circle key={`d1-${x}`} cx={x} cy="240" r="1.2" fill="#555" opacity="0.3" />
        ))}
        {/* Range dots row 2 */}
        {[56, 72, 88, 100, 112, 128, 144].map(x => (
          <circle key={`d2-${x}`} cx={x} cy="280" r="1.2" fill="#555" opacity="0.25" />
        ))}

        {/* Foul line */}
        <line x1="28" y1="265" x2="172" y2="265" stroke="#cc2222" strokeWidth="2.5" opacity="0.6" />
        <line x1="28" y1="265" x2="172" y2="265" stroke="#ff4444" strokeWidth="1" opacity="0.3" />

        {/* Approach area (darker wood) */}
        <rect x="28" y="265" width="144" height="75" fill="url(#bl-approach)" opacity="0.4" />

        {/* Pins */}
        {pinLayout.map((pin, i) => {
          const isFallen = fallenPins.has(i) || previouslyFallen.has(i);
          const fall = pinFallAngles[i];
          if (previouslyFallen.has(i)) return null;
          return (
            <g key={i}>
              {!isFallen ? (
                <g>
                  {/* Pin shadow */}
                  <ellipse cx={pin.x + 0.5} cy={pin.y + 10} rx="4" ry="1.5" fill="rgba(0,0,0,0.35)" />
                  {/* Pin body (belly) */}
                  <ellipse cx={pin.x} cy={pin.y + 5} rx="3.5" ry="4.5" fill="url(#bl-pin-body)" />
                  {/* Pin neck */}
                  <rect x={pin.x - 1.5} y={pin.y + 0.5} width="3" height="3" fill="#f0ece6" rx="0.5" />
                  {/* Pin head */}
                  <ellipse cx={pin.x} cy={pin.y} rx="2.5" ry="2.8" fill="#f8f4ee" />
                  {/* Red stripe upper */}
                  <ellipse cx={pin.x} cy={pin.y - 0.8} rx="2.4" ry="0.9" fill="#cc1111" opacity="0.85" />
                  {/* Red stripe lower */}
                  <ellipse cx={pin.x} cy={pin.y + 0.8} rx="2.2" ry="0.6" fill="#cc1111" opacity="0.55" />
                  {/* Highlight */}
                  <ellipse cx={pin.x - 0.8} cy={pin.y - 1.2} rx="1" ry="1.5" fill="rgba(255,255,255,0.4)" />
                  {/* Base highlight */}
                  <ellipse cx={pin.x - 1} cy={pin.y + 4} rx="1" ry="1.8" fill="rgba(255,255,255,0.15)" />
                </g>
              ) : fall && (
                <motion.g
                  initial={{ rotate: 0, x: 0, y: 0, opacity: 1 }}
                  animate={{ rotate: fall.angle, x: fall.dx, y: fall.dy + 5, opacity: 0.15 }}
                  transition={{ duration: 0.5, ease: 'easeOut' }}
                  style={{ originX: `${pin.x}px`, originY: `${pin.y}px` }}>
                  <ellipse cx={pin.x} cy={pin.y + 3} rx="3" ry="4" fill="#d0c8b8" />
                  <ellipse cx={pin.x} cy={pin.y - 1} rx="2.2" ry="2.2" fill="#d0c8b8" />
                  <ellipse cx={pin.x} cy={pin.y - 0.5} rx="2" ry="0.7" fill="#aa2222" opacity="0.5" />
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
            {/* Ball shadow */}
            <ellipse cx={ballPos.x} cy={ballPos.y + 8} rx={7 + (1 - ballPos.y / 300) * 2} ry="2.5"
              fill="rgba(0,0,0,0.4)" />
            {/* Ball glow */}
            <circle cx={ballPos.x} cy={ballPos.y} r={10 + (1 - ballPos.y / 300) * 2}
              fill={isMyTurn ? "rgba(0,217,255,0.08)" : "rgba(255,100,100,0.08)"} />
            {/* Ball body */}
            <circle cx={ballPos.x} cy={ballPos.y} r={8 + (1 - ballPos.y / 300) * 1.5}
              fill={isMyTurn ? "url(#bl-ball)" : "url(#bl-ball-bot)"}
              stroke={isMyTurn ? "rgba(0,217,255,0.25)" : "rgba(255,100,100,0.25)"} strokeWidth="0.5" />
            {/* Finger holes */}
            <g transform={`rotate(${ballRotation}, ${ballPos.x}, ${ballPos.y})`}>
              <circle cx={ballPos.x - 2.5} cy={ballPos.y - 2.5} r="1.2" fill="rgba(0,0,0,0.5)" />
              <circle cx={ballPos.x + 2.5} cy={ballPos.y - 2.5} r="1.2" fill="rgba(0,0,0,0.5)" />
              <circle cx={ballPos.x} cy={ballPos.y + 2} r="1" fill="rgba(0,0,0,0.5)" />
            </g>
            {/* Ball trail */}
            <line x1={ballPos.x} y1={ballPos.y + 12} x2={ballPos.x} y2={Math.min(ballPos.y + 35, 330)}
              stroke={isMyTurn ? "rgba(0,217,255,0.1)" : "rgba(255,100,100,0.1)"} strokeWidth="4" strokeLinecap="round" />
          </g>
        )}

        {/* Ball at rest */}
        {!isRolling && isMyTurn && (
          <g>
            <ellipse cx={ballX} cy={318} rx="8" ry="2.5" fill="rgba(0,0,0,0.4)" />
            {/* Glow ring */}
            {isDragging && (
              <circle cx={ballX} cy={308} r="14" fill="none"
                stroke="rgba(0,217,255,0.2)" strokeWidth="1.5" strokeDasharray="3,3">
                <animateTransform attributeName="transform" type="rotate"
                  from={`0 ${ballX} 308`} to={`360 ${ballX} 308`} dur="3s" repeatCount="indefinite" />
              </circle>
            )}
            <circle cx={ballX} cy={308} r="10" fill="url(#bl-ball)"
              stroke={isDragging ? 'rgba(0,217,255,0.6)' : 'rgba(0,217,255,0.15)'} strokeWidth="1"
              style={{ filter: isDragging ? 'drop-shadow(0 0 16px rgba(0,217,255,0.5))' : 'drop-shadow(0 2px 6px rgba(0,0,0,0.5))' }}>
              {isDragging && <animate attributeName="r" values="10;11;10" dur="0.5s" repeatCount="indefinite" />}
            </circle>
            {/* Finger holes */}
            <circle cx={ballX - 2.5} cy={306} r="1.3" fill="rgba(0,0,0,0.4)" />
            <circle cx={ballX + 2.5} cy={306} r="1.3" fill="rgba(0,0,0,0.4)" />
            <circle cx={ballX} cy={309.5} r="1.1" fill="rgba(0,0,0,0.4)" />
            {/* Highlight */}
            <ellipse cx={ballX - 3} cy={304} rx="2" ry="2.5" fill="rgba(255,255,255,0.15)" />
          </g>
        )}

        {/* Aim line */}
        {isDragging && (
          <>
            <line x1={ballX} y1={300} x2={ballX + spinAngle * 30} y2={40}
              stroke="rgba(0,217,255,0.2)" strokeWidth="1.5" strokeDasharray="6,4" />
            <circle cx={ballX + spinAngle * 30} cy={40} r="4" fill="rgba(0,217,255,0.1)"
              stroke="rgba(0,217,255,0.2)" strokeWidth="0.5" />
          </>
        )}

        {/* Side bumper lights (decorative) */}
        {[60, 120, 180, 240].map(y => (
          <g key={`light-${y}`}>
            <circle cx="14" cy={y} r="1.5" fill={isRolling ? '#00D9FF' : '#333'} opacity={isRolling ? 0.6 : 0.3}>
              {isRolling && <animate attributeName="opacity" values="0.6;0.2;0.6" dur="0.4s" repeatCount="indefinite" />}
            </circle>
            <circle cx="186" cy={y} r="1.5" fill={isRolling ? '#00D9FF' : '#333'} opacity={isRolling ? 0.6 : 0.3}>
              {isRolling && <animate attributeName="opacity" values="0.2;0.6;0.2" dur="0.4s" repeatCount="indefinite" />}
            </circle>
          </g>
        ))}
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
