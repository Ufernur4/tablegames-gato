import { memo } from 'react';

const SECTIONS = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];

interface DartStick { x: number; y: number; points: number; label: string }

interface DartBoardProps {
  darts: DartStick[];
  svgRef: React.RefObject<SVGSVGElement>;
}

function DartBoardInner({ darts, svgRef }: DartBoardProps) {
  return (
    <svg ref={svgRef} viewBox="-180 -180 360 360" className="w-full h-full">
      <defs>
        {/* Metal ring gradient */}
        <radialGradient id="boardGlow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0.85" stopColor="transparent" />
          <stop offset="1" stopColor="hsl(175,85%,50%)" stopOpacity="0.08" />
        </radialGradient>
        <radialGradient id="bullGrad" cx="0.35" cy="0.35" r="0.6">
          <stop offset="0" stopColor="hsl(0,70%,55%)" />
          <stop offset="1" stopColor="hsl(0,70%,30%)" />
        </radialGradient>
        <radialGradient id="outerBullGrad" cx="0.4" cy="0.4" r="0.6">
          <stop offset="0" stopColor="hsl(145,55%,38%)" />
          <stop offset="1" stopColor="hsl(145,55%,22%)" />
        </radialGradient>
        <filter id="boardShadow">
          <feDropShadow dx="0" dy="4" stdDeviation="8" floodColor="black" floodOpacity="0.6" />
        </filter>
        <filter id="dartGlow">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      {/* Outer shadow ring */}
      <circle cx="0" cy="0" r="172" fill="hsl(0,0%,5%)" filter="url(#boardShadow)" />
      
      {/* Metal frame ring */}
      <circle cx="0" cy="0" r="170" fill="none" stroke="hsl(0,0%,35%)" strokeWidth="5" />
      <circle cx="0" cy="0" r="168" fill="none" stroke="hsl(0,0%,20%)" strokeWidth="1" />
      
      {/* Board background */}
      <circle cx="0" cy="0" r="165" fill="hsl(0,0%,6%)" />
      <circle cx="0" cy="0" r="165" fill="url(#boardGlow)" />

      {/* Sections */}
      {SECTIONS.map((num, i) => {
        const a1 = (i * 18 - 99) * Math.PI / 180;
        const a2 = ((i + 1) * 18 - 99) * Math.PI / 180;
        const isEven = i % 2 === 0;
        const dark = isEven ? 'hsl(0,0%,8%)' : 'hsl(45,40%,55%)';
        const red = 'hsl(0,70%,38%)';
        const green = 'hsl(145,50%,28%)';
        
        // Rings: outer double, outer single, triple, inner single
        const rings = [
          { r1: 155, r2: 140, fill: isEven ? red : green },      // double
          { r1: 140, r2: 105, fill: dark },                       // outer single
          { r1: 105, r2: 90, fill: isEven ? red : green },        // triple
          { r1: 90, r2: 25, fill: dark },                         // inner single
        ];

        return (
          <g key={i}>
            {rings.map((ring, ri) => {
              const c1 = Math.cos(a1), s1 = Math.sin(a1);
              const c2 = Math.cos(a2), s2 = Math.sin(a2);
              return (
                <path key={ri}
                  d={`M${c1*ring.r2},${s1*ring.r2} A${ring.r2},${ring.r2} 0 0,1 ${c2*ring.r2},${s2*ring.r2} L${c2*ring.r1},${s2*ring.r1} A${ring.r1},${ring.r1} 0 0,0 ${c1*ring.r1},${s1*ring.r1} Z`}
                  fill={ring.fill}
                  stroke="hsl(0,0%,22%)" strokeWidth="0.6"
                />
              );
            })}
            {/* Wire line */}
            <line x1={Math.cos(a1)*25} y1={Math.sin(a1)*25} x2={Math.cos(a1)*155} y2={Math.sin(a1)*155}
              stroke="hsl(0,0%,30%)" strokeWidth="0.6" />
            {/* Number */}
            <text
              x={Math.cos((a1+a2)/2)*163} y={Math.sin((a1+a2)/2)*163+4}
              textAnchor="middle" fill="hsl(0,0%,90%)" fontSize="10" fontWeight="800"
              style={{ fontFamily: 'Outfit, sans-serif' }}
            >{num}</text>
          </g>
        );
      })}

      {/* Wire circles */}
      {[155, 140, 105, 90, 25].map(r => (
        <circle key={r} cx="0" cy="0" r={r} fill="none" stroke="hsl(0,0%,28%)" strokeWidth="0.7" />
      ))}

      {/* Outer bull */}
      <circle cx="0" cy="0" r="25" fill="url(#outerBullGrad)" stroke="hsl(0,0%,28%)" strokeWidth="0.8" />
      {/* Inner bull */}
      <circle cx="0" cy="0" r="10" fill="url(#bullGrad)" stroke="hsl(0,0%,28%)" strokeWidth="0.8" />
      {/* Bull highlight */}
      <circle cx="-3" cy="-3" r="4" fill="hsl(0,70%,60%)" opacity="0.25" />

      {/* Stuck darts */}
      {darts.map((dart, i) => (
        <g key={i} filter="url(#dartGlow)">
          {/* Impact mark */}
          <circle cx={dart.x} cy={dart.y} r="5" fill="hsl(175,85%,50%)" opacity="0.15">
            <animate attributeName="r" from="8" to="5" dur="0.3s" fill="freeze" />
            <animate attributeName="opacity" from="0.4" to="0.15" dur="0.3s" fill="freeze" />
          </circle>
          {/* Dart point */}
          <circle cx={dart.x} cy={dart.y} r="2.5" fill="hsl(175,85%,50%)" stroke="hsl(175,85%,70%)" strokeWidth="0.5">
            <animate attributeName="r" from="4" to="2.5" dur="0.25s" fill="freeze" />
          </circle>
          {/* Dart shaft */}
          <line x1={dart.x} y1={dart.y} x2={dart.x+2} y2={dart.y-18}
            stroke="hsl(0,0%,70%)" strokeWidth="1.8" strokeLinecap="round" />
          {/* Flight */}
          <polygon
            points={`${dart.x-3},${dart.y-15} ${dart.x+2},${dart.y-22} ${dart.x+7},${dart.y-15}`}
            fill="hsl(175,85%,50%)" opacity="0.7"
          />
          <polygon
            points={`${dart.x-1},${dart.y-15} ${dart.x+2},${dart.y-20} ${dart.x+5},${dart.y-15}`}
            fill="hsl(175,85%,70%)" opacity="0.3"
          />
        </g>
      ))}
    </svg>
  );
}

export const DartBoard = memo(DartBoardInner);
export { SECTIONS };
