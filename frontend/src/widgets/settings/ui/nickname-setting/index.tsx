import { useEffect, useEffectEvent, useState } from 'react';

import { useLingui } from '@lingui/react/macro';
import { useUnit } from 'effector-react';
import { Check, Loader2 } from 'lucide-react';

import {
  NICKNAME_MAX,
  NICKNAME_MIN,
  normalizeNickname,
  sessionModel,
  validateNickname,
  type NicknameError,
} from 'entities/session';
import { cn } from 'shared/utils/cn';

import styles from './nickname-setting.module.css';

interface Props {
  /** Reset the draft to the saved name each time Settings opens. */
  open: boolean;
  /** Shown until the profile loads (the Telegram name). */
  fallbackName: string;
}

/** Nickname shown at the table: edit, validate, save to the profile. */
export const NicknameSetting = ({ open, fallbackName }: Props) => {
  const { t } = useLingui();
  const [nickname, saving, status, save, resetStatus] = useUnit([
    sessionModel.$nickname,
    sessionModel.$nicknameSaving,
    sessionModel.$nicknameSaveStatus,
    sessionModel.saveNickname,
    sessionModel.nicknameSaveReset,
  ]);
  const current = nickname ?? fallbackName;
  const [draft, setDraft] = useState(current);

  // Only when the dialog opens; typing must not be overwritten.
  const resetDraft = useEffectEvent(() => {
    setDraft(current);
    resetStatus();
  });

  useEffect(() => {
    if (open) {
      resetDraft();
    }
  }, [open]);

  // After a save, show the stored form ("  Ace   King " → "Ace King").
  if (
    status === 'saved' &&
    draft !== current &&
    normalizeNickname(draft) === current
  ) {
    setDraft(current);
  }

  const error = validateNickname(draft);
  const changed = normalizeNickname(draft) !== current;
  const canSave = changed && !error && !saving;

  const errorText: Record<NicknameError, string> = {
    short: t`At least ${NICKNAME_MIN} characters`,
    long: t`At most ${NICKNAME_MAX} characters`,
    chars: t`Letters, digits, space, dot, dash and underscore only`,
  };

  const hint =
    status === 'failed'
      ? t`Couldn't save the nickname. Try again.`
      : changed && error
        ? errorText[error]
        : status === 'saved' && !changed
          ? t`Saved`
          : t`Shown to other players at the table`;
  const hintTone =
    status === 'failed' || (changed && error)
      ? styles.hintError
      : status === 'saved' && !changed
        ? styles.hintSuccess
        : undefined;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();

    if (canSave) {
      save(normalizeNickname(draft));
    }
  };

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      <div className={styles.row}>
        <input
          className={cn(styles.input, changed && error && styles.inputError)}
          value={draft}
          onChange={event => {
            setDraft(event.target.value);
            if (status !== 'idle') resetStatus();
          }}
          maxLength={NICKNAME_MAX + 8}
          autoComplete="nickname"
          spellCheck={false}
          aria-label={t`Nickname`}
          aria-invalid={Boolean(changed && error)}
          aria-describedby="nickname-hint"
        />
        <button type="submit" className={styles.save} disabled={!canSave}>
          {saving ? (
            <Loader2 size={16} className={styles.spin} />
          ) : status === 'saved' && !changed ? (
            <Check size={16} strokeWidth={2.5} />
          ) : (
            t`Save`
          )}
        </button>
      </div>
      <p id="nickname-hint" className={cn(styles.hint, hintTone)} role="status">
        {hint}
      </p>
    </form>
  );
};
