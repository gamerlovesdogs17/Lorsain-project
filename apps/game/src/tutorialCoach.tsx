import { useEffect, useId, useMemo, useState } from "react";
import { getTutorialLesson, type TutorialLessonId } from "./tutorial.js";
import { useSettings } from "./settingsContext.js";

type TutorialCoachProps = {
  lessonId: TutorialLessonId | null;
  onDismissLesson: (id: TutorialLessonId) => void;
};

/**
 * Bounded highlight/popover coach — not a permanent advisor panel.
 * Completing, skipping, or finishing marks the lesson done.
 */
export function TutorialCoach(props: { activeLesson: TutorialLessonId | null }) {
  const { settings, completeTutorialLesson } = useSettings();
  const lessonId =
    settings.tutorialMode &&
    props.activeLesson &&
    !settings.completedTutorialLessons.includes(props.activeLesson)
      ? props.activeLesson
      : null;

  if (!lessonId) return null;
  return (
    <TutorialCoachInner lessonId={lessonId} onDismissLesson={(id) => completeTutorialLesson(id)} />
  );
}

function TutorialCoachInner(props: TutorialCoachProps) {
  const lesson = getTutorialLesson(props.lessonId!);
  const titleId = useId();
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    setStepIndex(0);
  }, [props.lessonId]);

  useEffect(() => {
    if (!lesson) return;
    const target = lesson.steps[stepIndex]?.target;
    document.querySelectorAll("[data-tutorial-active]").forEach((el) => {
      el.removeAttribute("data-tutorial-active");
    });
    if (!target) return;
    const node = document.querySelector(`[data-tutorial="${target}"]`);
    if (node instanceof HTMLElement) {
      node.setAttribute("data-tutorial-active", "true");
      node.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
    return () => {
      document.querySelectorAll("[data-tutorial-active]").forEach((el) => {
        el.removeAttribute("data-tutorial-active");
      });
    };
  }, [lesson, stepIndex]);

  const step = lesson?.steps[stepIndex];
  const total = lesson?.steps.length ?? 0;
  const atEnd = stepIndex >= total - 1;

  const dialogLabel = useMemo(
    () => (lesson ? `${lesson.title} · step ${stepIndex + 1} of ${total}` : "Tutorial"),
    [lesson, stepIndex, total],
  );

  if (!lesson || !step) return null;

  return (
    <div className="tutorial-coach" role="dialog" aria-modal="false" aria-labelledby={titleId}>
      <div className="tutorial-coach-card">
        <div className="tutorial-coach-kicker">{dialogLabel}</div>
        <h2 id={titleId} className="tutorial-coach-title">
          {step.title}
        </h2>
        <p className="tutorial-coach-body">{step.body}</p>
        <div className="tutorial-coach-actions">
          <button
            type="button"
            className="btn ghost"
            onClick={() => props.onDismissLesson(lesson.id)}
          >
            Skip lesson
          </button>
          <div className="tutorial-coach-nav">
            <button
              type="button"
              className="btn secondary"
              disabled={stepIndex === 0}
              onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
            >
              Back
            </button>
            {atEnd ? (
              <button
                type="button"
                className="btn"
                onClick={() => props.onDismissLesson(lesson.id)}
              >
                Done
              </button>
            ) : (
              <button
                type="button"
                className="btn"
                onClick={() => setStepIndex((i) => Math.min(total - 1, i + 1))}
              >
                Next
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
