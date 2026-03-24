import { useState, useCallback, useRef } from 'react';
import { sounds } from '@/lib/sounds';

const SECTIONS = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];

export interface DartStick { x: number; y: number; points: number; label: string }
export interface ThrowState {
  isDragging: boolean;
  dragStart: { x: number; y: number };
  dragCurrent: { x: number; y: number };
  power: number;
  throwAnim: { x: number; y: number } | null;
}

export function calcHit(svgX: number, svgY: number): { points: number; label: string } {
  const dist = Math.sqrt(svgX * svgX + svgY * svgY);
  if (dist > 160) return { points: 0, label: 'Miss!' };
  if (dist <= 10) return { points: 50, label: 'BULLSEYE! 🎯' };
  if (dist <= 25) return { points: 25, label: 'Bull 25' };
  let angle = Math.atan2(svgY, svgX) * 180 / Math.PI + 99;
  if (angle < 0) angle += 360;
  const idx = Math.floor(angle / 18) % 20;
  const num = SECTIONS[idx];
  if (dist > 140 && dist <= 155) return { points: num * 2, label: `Double ${num}` };
  if (dist > 90 && dist <= 105) return { points: num * 3, label: `Triple ${num}! 🔥` };
  return { points: num, label: `${num}` };
}

export function useDartThrow(
  canThrow: boolean,
  maxDarts: number,
  onHit: (hit: { points: number; label: string }, dart: DartStick) => void,
) {
  const [darts, setDarts] = useState<DartStick[]>([]);
  const [currentDart, setCurrentDart] = useState(0);
  const [lastHit, setLastHit] = useState<{ points: number; label: string } | null>(null);
  const [throwState, setThrowState] = useState<ThrowState>({
    isDragging: false,
    dragStart: { x: 0, y: 0 },
    dragCurrent: { x: 0, y: 0 },
    power: 0,
    throwAnim: null,
  });
  const animating = useRef(false);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (!canThrow || currentDart >= maxDarts || animating.current) return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    setThrowState(prev => ({
      ...prev,
      isDragging: true,
      dragStart: { x: e.clientX, y: e.clientY },
      dragCurrent: { x: e.clientX, y: e.clientY },
      power: 0,
    }));
    setLastHit(null);
  }, [canThrow, currentDart, maxDarts]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    setThrowState(prev => {
      if (!prev.isDragging) return prev;
      const dy = e.clientY - prev.dragStart.y;
      return {
        ...prev,
        dragCurrent: { x: e.clientX, y: e.clientY },
        power: Math.min(Math.abs(Math.min(dy, 0)) / 120, 1),
      };
    });
  }, []);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    setThrowState(prev => {
      if (!prev.isDragging) return prev;
      const dy = e.clientY - prev.dragStart.y;
      const dx = e.clientX - prev.dragStart.x;

      // Need upward swipe
      if (dy > -25) {
        return { ...prev, isDragging: false, power: 0 };
      }

      const power = Math.min(Math.abs(dy) / 160, 1);
      const accuracy = 1 - Math.min(Math.abs(dx) / 120, 1);
      const jitter = (1 - accuracy) * 100 + (1 - power) * 30;
      const targetX = (dx * 0.5) + (Math.random() - 0.5) * jitter;
      const targetY = -(power * 80) + 30 + (Math.random() - 0.5) * jitter;

      animating.current = true;

      // Play throw whoosh
      sounds.move();

      // Delayed impact
      setTimeout(() => {
        const hit = calcHit(targetX, targetY);
        const dart: DartStick = { x: targetX, y: targetY, ...hit };
        
        setDarts(p => [...p, dart]);
        setCurrentDart(p => p + 1);
        setLastHit(hit);
        animating.current = false;

        // Sound based on score
        if (hit.points >= 50) sounds.achievement();
        else if (hit.points >= 25) sounds.coinEarn();
        else if (hit.points > 0) sounds.click();
        else sounds.invalid();

        onHit(hit, dart);
      }, 400);

      return {
        ...prev,
        isDragging: false,
        power: 0,
        throwAnim: { x: targetX, y: targetY },
      };
    });

    // Clear throw anim after delay
    setTimeout(() => {
      setThrowState(prev => ({ ...prev, throwAnim: null }));
    }, 450);
  }, [onHit]);

  const reset = useCallback(() => {
    setDarts([]);
    setCurrentDart(0);
    setLastHit(null);
  }, []);

  return {
    darts, currentDart, lastHit, throwState,
    handlePointerDown, handlePointerMove, handlePointerUp,
    reset,
    dartsLeft: maxDarts - currentDart,
  };
}
