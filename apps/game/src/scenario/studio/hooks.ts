import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  validateScenario,
  type ScenarioDocument,
  type ScenarioValidationReport,
} from "@lorsain/scenario";

const AUTOSAVE_PREFIX = "lorsain-scenario-studio:";
const UNDO_MAX = 50;

export function useScenarioAutosave(doc: ScenarioDocument, dirty: boolean) {
  const key = `${AUTOSAVE_PREFIX}${doc.scenarioId}`;
  useEffect(() => {
    if (!dirty) return;
    const t = window.setTimeout(() => {
      try {
        localStorage.setItem(key, JSON.stringify(doc));
      } catch {
        /* quota */
      }
    }, 800);
    return () => window.clearTimeout(t);
  }, [doc, dirty, key]);

  return useCallback(() => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      return JSON.parse(raw) as ScenarioDocument;
    } catch {
      return null;
    }
  }, [key]);
}

export function useDebouncedValidation(doc: ScenarioDocument, ms = 350): ScenarioValidationReport {
  const [report, setReport] = useState(() => validateScenario(doc));
  useEffect(() => {
    const t = window.setTimeout(() => setReport(validateScenario(doc)), ms);
    return () => window.clearTimeout(t);
  }, [doc, ms]);
  return report;
}

export function useUndoStack(initial: ScenarioDocument) {
  const [doc, setDoc] = useState<ScenarioDocument>(() => structuredClone(initial));
  const undoRef = useRef<ScenarioDocument[]>([]);
  const redoRef = useRef<ScenarioDocument[]>([]);
  const [dirty, setDirty] = useState(false);
  const [stackTick, setStackTick] = useState(0);
  const bumpStack = () => setStackTick((n) => n + 1);

  const patch = useCallback((updater: (prev: ScenarioDocument) => ScenarioDocument) => {
    setDoc((prev) => {
      const next = updater(prev);
      if (next === prev) return prev;
      undoRef.current = [...undoRef.current.slice(-(UNDO_MAX - 1)), structuredClone(prev)];
      redoRef.current = [];
      setDirty(true);
      bumpStack();
      return next;
    });
  }, []);

  const replace = useCallback((next: ScenarioDocument, markDirty = true) => {
    setDoc(structuredClone(next));
    if (markDirty) {
      undoRef.current = [];
      redoRef.current = [];
      setDirty(true);
      bumpStack();
    }
  }, []);

  const undo = useCallback(() => {
    const prev = undoRef.current.pop();
    if (!prev) return;
    redoRef.current.push(structuredClone(doc));
    setDoc(prev);
    setDirty(true);
    bumpStack();
  }, [doc]);

  const redo = useCallback(() => {
    const next = redoRef.current.pop();
    if (!next) return;
    undoRef.current.push(structuredClone(doc));
    setDoc(next);
    setDirty(true);
    bumpStack();
  }, [doc]);

  const canUndo = undoRef.current.length > 0;
  const canRedo = redoRef.current.length > 0;
  void stackTick;

  return useMemo(
    () => ({
      doc,
      patch,
      replace,
      undo,
      redo,
      canUndo,
      canRedo,
      dirty,
      setDirty,
    }),
    [doc, patch, replace, undo, redo, canUndo, canRedo, dirty],
  );
}
