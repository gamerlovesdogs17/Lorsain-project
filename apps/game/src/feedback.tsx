import { useState, type ReactNode } from "react";
import type { CommandResult } from "@lorsain/sim";

export function friendlyCommandError(error: { code: string; message: string }): string {
  const map: Record<string, string> = {
    ACTIVE_RIVAL: "An active candidate in this race cannot endorse a rival. Withdraw first.",
    NO_ACTION_POINTS: "No campaign actions remain this month.",
    INSUFFICIENT_FUNDS: "The campaign does not have enough cash for that spend.",
    INVALID_TARGET: "That target is not available for this action.",
    INVALID_GEOGRAPHY: "Choose a valid place for this action.",
    INVALID_MESSAGE_TYPE: "That advertisement type is not allowed here.",
    PLAYER_AUTONOMY: "You must make this choice yourself.",
    NOT_AN_MP: "Only a sitting Assembly member can do that.",
    NOT_PRESIDENT: "Only the President can do that.",
    NOT_SPEAKER: "Only the Speaker can do that.",
    UNKNOWN_ISSUE: "Choose a recognized issue.",
    INVALID_BILL: "That bill cannot accept this action right now.",
    CAMPAIGN_INACTIVE: "That campaign is no longer active.",
    LEGISLATIVE_CAPACITY: "The Assembly already has as many active bills as it will take.",
  };
  return map[error.code] ?? error.message;
}

export function CommandNotice(props: { text: string | null; onDismiss: () => void }) {
  if (!props.text) return null;
  return (
    <div className="notice" role="status">
      <span>{props.text}</span>
      <button type="button" className="btn secondary" onClick={props.onDismiss}>
        Dismiss
      </button>
    </div>
  );
}

export function ConfirmDialog(props: {
  title: string;
  body: string;
  confirmLabel?: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="modal-backdrop">
      <div className="modal card">
        <h3>{props.title}</h3>
        <p>{props.body}</p>
        <div className="row">
          <button type="button" className="btn danger" onClick={props.onConfirm}>
            {props.confirmLabel ?? "Confirm"}
          </button>
          <button type="button" className="btn secondary" onClick={props.onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export function useCommandFeedback() {
  const [notice, setNotice] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{
    title: string;
    body: string;
    confirmLabel?: string;
    action: () => void;
  } | null>(null);

  function report(result: CommandResult): boolean {
    if (result.ok) {
      setNotice(null);
      return true;
    }
    setNotice(friendlyCommandError(result.error));
    return false;
  }

  function askConfirm(opts: {
    title: string;
    body: string;
    confirmLabel?: string;
    action: () => void;
  }) {
    setConfirm(opts);
  }

  function overlay(): ReactNode {
    return (
      <>
        <CommandNotice text={notice} onDismiss={() => setNotice(null)} />
        {confirm ? (
          <ConfirmDialog
            title={confirm.title}
            body={confirm.body}
            {...(confirm.confirmLabel ? { confirmLabel: confirm.confirmLabel } : {})}
            onCancel={() => setConfirm(null)}
            onConfirm={() => {
              const action = confirm.action;
              setConfirm(null);
              action();
            }}
          />
        ) : null}
      </>
    );
  }

  return { notice, report, askConfirm, overlay, setNotice };
}
