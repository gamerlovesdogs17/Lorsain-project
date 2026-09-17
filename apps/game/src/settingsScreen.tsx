import { useState } from "react";
import { PageHeader, SectionCard, StatusBadge, TabBar } from "./ui/kit.js";
import { GLOSSARY_ENTRIES } from "./glossary.js";
import { NOTIFICATION_CATEGORIES } from "./settings.js";
import { useSettings } from "./settingsContext.js";

type SettingsSection = "game" | "interface" | "notifications" | "accessibility" | "advanced";

const DEBUG_MODE_DESCRIPTION =
  "Shows internal simulation information and diagnostic controls. Intended for testing and may reveal information normally hidden from the player.";

export function SettingsPage(props: { onBack?: () => void; showBack?: boolean }) {
  const { settings, update, resetTutorialProgress } = useSettings();
  const [section, setSection] = useState<SettingsSection>("game");
  const completedCount = settings.completedTutorialLessons.length;

  return (
    <div className="settings-page settings-final" data-qa="settings-page">
      <PageHeader
        kicker="Preferences"
        title="Settings"
        subtitle="Gameplay, interface, notifications, and advanced diagnostics."
        actions={
          props.showBack !== false && props.onBack ? (
            <button type="button" className="btn secondary" onClick={props.onBack}>
              Back
            </button>
          ) : null
        }
      />

      <TabBar
        tabs={[
          { id: "game", label: "Game" },
          { id: "interface", label: "Interface" },
          { id: "notifications", label: "Notifications" },
          { id: "accessibility", label: "Accessibility" },
          { id: "advanced", label: "Advanced" },
        ]}
        value={section}
        onChange={setSection}
      />

      {section === "game" ? (
        <SectionCard title="Game">
          <label className="settings-toggle" data-qa="settings-tutorial-toggle">
            <input
              type="checkbox"
              checked={settings.tutorialMode}
              onChange={(e) => update({ tutorialMode: e.target.checked })}
            />
            <span>
              <strong>Tutorial Mode</strong>
              <small className="muted">
                Short first-use lessons when you open a screen. Turning this off does not erase
                completed lessons. No permanent coach and no hidden simulation math.
              </small>
            </span>
          </label>
          <div className="settings-tutorial-reset row">
            <button
              type="button"
              className="btn secondary"
              data-qa="settings-tutorial-reset"
              onClick={() => resetTutorialProgress()}
              disabled={completedCount === 0}
            >
              Reset tutorial progress
            </button>
            <span className="muted">
              {completedCount === 0
                ? "No lessons completed yet."
                : `${completedCount} lesson${completedCount === 1 ? "" : "s"} marked done.`}
            </span>
          </div>
          <label className="settings-toggle">
            <input
              type="checkbox"
              checked={settings.autosave}
              onChange={(e) => update({ autosave: e.target.checked })}
            />
            <span>
              <strong>Autosave</strong>
              <small className="muted">
                Ordinary automatic saves during play (for example before ending a turn). Critical
                safety checkpoints before national counts and nomination resolution still run when
                needed for integrity.
              </small>
            </span>
          </label>
          <label className="settings-toggle">
            <input
              type="checkbox"
              checked={settings.confirmMajorActions}
              onChange={(e) => update({ confirmMajorActions: e.target.checked })}
            />
            <span>
              <strong>Confirm major actions</strong>
              <small className="muted">
                Ask before irreversible political decisions when confirmation is available.
              </small>
            </span>
          </label>
        </SectionCard>
      ) : null}

      {section === "interface" ? (
        <>
          <SectionCard title="Interface">
            <label className="settings-toggle">
              <input
                type="checkbox"
                checked={settings.compactDensity}
                onChange={(e) => update({ compactDensity: e.target.checked })}
              />
              <span>
                <strong>Compact density</strong>
                <small className="muted">Tighten spacing on dossiers and tables.</small>
              </span>
            </label>
          </SectionCard>
          <SectionCard title="Glossary">
            <p className="muted">
              Short definitions for specialized terms. Ordinary political words are used directly in
              the game UI.
            </p>
            <dl className="glossary-list" data-qa="settings-glossary">
              {GLOSSARY_ENTRIES.map((entry) => (
                <div className="glossary-term" key={entry.id}>
                  <dt>{entry.term}</dt>
                  <dd>{entry.definition}</dd>
                </div>
              ))}
            </dl>
          </SectionCard>
        </>
      ) : null}

      {section === "notifications" ? (
        <SectionCard title="Notifications">
          <p className="muted">
            Broad attention categories — not eighty individual toggles. Disabling a category hides
            informational inbox items only; required decisions always appear.
          </p>
          {NOTIFICATION_CATEGORIES.map((row) => (
            <label className="settings-toggle" key={row.id}>
              <input
                type="checkbox"
                checked={settings.notifications[row.id]}
                onChange={(e) =>
                  update({
                    notifications: {
                      ...settings.notifications,
                      [row.id]: e.target.checked,
                    },
                  })
                }
              />
              <span>
                <strong>{row.label}</strong>
              </span>
            </label>
          ))}
        </SectionCard>
      ) : null}

      {section === "accessibility" ? (
        <SectionCard title="Accessibility">
          <label className="settings-toggle">
            <input
              type="checkbox"
              checked={settings.reducedMotion}
              onChange={(e) => update({ reducedMotion: e.target.checked })}
            />
            <span>
              <strong>Reduced motion</strong>
              <small className="muted">Limit animated emphasis.</small>
            </span>
          </label>
          <label className="settings-toggle">
            <input
              type="checkbox"
              checked={settings.highContrast}
              onChange={(e) => update({ highContrast: e.target.checked })}
            />
            <span>
              <strong>High contrast</strong>
              <small className="muted">Increase contrast on supported surfaces.</small>
            </span>
          </label>
        </SectionCard>
      ) : null}

      {section === "advanced" ? (
        <SectionCard title="Advanced">
          <label className="settings-toggle" data-qa="settings-debug-toggle">
            <input
              type="checkbox"
              checked={settings.debugMode}
              onChange={(e) => update({ debugMode: e.target.checked })}
            />
            <span>
              <strong>Debug Mode</strong>
              <small className="muted">{DEBUG_MODE_DESCRIPTION}</small>
            </span>
          </label>
          <div className="settings-meta row">
            <StatusBadge tone={settings.debugMode ? "warn" : "idle"}>
              {settings.debugMode ? "Diagnostics on" : "Player view"}
            </StatusBadge>
            <span className="muted">Schema 26 · settings version {settings.version}</span>
          </div>
        </SectionCard>
      ) : null}
    </div>
  );
}
