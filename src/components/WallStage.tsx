import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { BOOKS } from '../data/books';
import { Wall, type CellState, type CoverOrigin } from '../lib/wall';

export interface WallHandle {
  setAssemble: (value: number) => void;
  wheel: (dx: number, dy: number) => boolean;
  setClearing: (value: number, now?: boolean) => void;
}

interface WallStageProps {
  states: Map<string, CellState> | null;
  interactive: boolean;
  paused: boolean;
  onOpen: (bookId: string, origin: CoverOrigin | null) => void;
  onPageScroll: (dy: number) => void;
}

/** React wrapper around the imperative cover wall. */
export const WallStage = forwardRef<WallHandle, WallStageProps>(function WallStage(
  { states, interactive, paused, onOpen, onPageScroll },
  ref,
) {
  const rootRef = useRef<HTMLDivElement>(null);
  const wallRef = useRef<Wall | null>(null);
  const callbacks = useRef({ onOpen, onPageScroll });
  callbacks.current = { onOpen, onPageScroll };
  // Props as of the latest render, so a wall rebuilt by the mount effect starts in sync.
  const latest = useRef({ states, interactive, paused });
  latest.current = { states, interactive, paused };

  useEffect(() => {
    if (!rootRef.current) return;
    const wall = new Wall(rootRef.current, BOOKS, {
      onOpen: (id, origin) => callbacks.current.onOpen(id, origin),
      onPageScroll: (dy) => callbacks.current.onPageScroll(dy),
    });
    wall.setStates(latest.current.states);
    wall.setInteractive(latest.current.interactive);
    wall.setPaused(latest.current.paused);
    wallRef.current = wall;
    return () => {
      wall.destroy();
      wallRef.current = null;
    };
  }, []);

  useEffect(() => wallRef.current?.setStates(states), [states]);
  useEffect(() => wallRef.current?.setInteractive(interactive), [interactive]);
  useEffect(() => wallRef.current?.setPaused(paused), [paused]);

  useImperativeHandle(
    ref,
    () => ({
      setAssemble: (value) => wallRef.current?.setAssemble(value),
      wheel: (dx, dy) => wallRef.current?.wheel(dx, dy) ?? false,
      setClearing: (value, now) => wallRef.current?.setClearing(value, now),
    }),
    [],
  );

  // The wall is decorative for assistive tech: the Index and the results tray list the same
  // books as real buttons.
  return <div ref={rootRef} className="wall" aria-hidden="true" />;
});
