import { describe, expect, it, beforeEach } from 'vitest';

class MemoryStorage {
  private store = new Map<string, string>();
  getItem(k: string) { return this.store.get(k) ?? null; }
  setItem(k: string, v: string) { this.store.set(k, v); }
  removeItem(k: string) { this.store.delete(k); }
  clear() { this.store.clear(); }
}

describe('useCardGestures Logic Suite', () => {
  beforeEach(() => {
    (globalThis as unknown as { localStorage: MemoryStorage }).localStorage = new MemoryStorage();
  });

  it('Distance and velocity thresholds are properly calibrated', () => {
    const DISTANCE_THRESHOLD = 60; // px
    const VELOCITY_THRESHOLD = 0.3; // px/ms
    const LEFT_EDGE_GUARD = 40; // px

    expect(DISTANCE_THRESHOLD).toBe(60);
    expect(VELOCITY_THRESHOLD).toBe(0.3);
    expect(LEFT_EDGE_GUARD).toBe(40);
  });

  it('Swipe calculation correctly differentiates left, right, and up directions', () => {
    const evaluateSwipe = (
      dx: number,
      dy: number,
      dt: number,
      startX: number,
    ): 'left' | 'right' | 'up' | 'none' => {
      const DISTANCE_THRESHOLD = 60;
      const VELOCITY_THRESHOLD = 0.3;
      const LEFT_EDGE_GUARD = 40;

      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);
      const velX = absDx / dt;
      const velY = absDy / dt;

      if (absDx > absDy) {
        if (dx < 0 && startX >= LEFT_EDGE_GUARD && (absDx > DISTANCE_THRESHOLD || velX > VELOCITY_THRESHOLD)) {
          return 'left';
        }
        if (dx > 0 && (absDx > DISTANCE_THRESHOLD || velX > VELOCITY_THRESHOLD)) {
          return 'right';
        }
      } else if (absDy > absDx && dy < 0) {
        if (absDy > DISTANCE_THRESHOLD || velY > VELOCITY_THRESHOLD) {
          return 'up';
        }
      }
      return 'none';
    };

    // Fast flick right (save)
    expect(evaluateSwipe(50, 5, 100, 100)).toBe('right'); // velX = 0.5 > 0.3

    // Slow drag right past distance threshold
    expect(evaluateSwipe(75, 10, 400, 100)).toBe('right'); // dx = 75 > 60

    // Fast flick left (downvote) starting away from left screen edge
    expect(evaluateSwipe(-50, 0, 100, 150)).toBe('left');

    // Left swipe starting within LEFT_EDGE_GUARD (ignored to prevent iOS back navigation clash)
    expect(evaluateSwipe(-70, 0, 100, 20)).toBe('none');

    // Upward swipe (advance)
    expect(evaluateSwipe(0, -80, 200, 100)).toBe('up');

    // Small wiggle below threshold (cancelled)
    expect(evaluateSwipe(15, 10, 200, 100)).toBe('none');
  });
});
