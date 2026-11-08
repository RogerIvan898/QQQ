import React from 'react';

import { useLingui } from '@lingui/react/macro';
import { Check, Pencil } from 'lucide-react';

import {
  NICKNAME_MAX,
  NICKNAME_MIN,
  normalizeNickname,
  validateNickname,
  type NicknameError,
} from 'entities/session';
import { cn } from 'shared/utils/cn';

import styles from './header.module.css';

interface Props {
  name: string;
  onSave: (nickname: string) => void;
}

/**
 * The player's name with a pencil next to it: tap to edit in place.
 * Enter or tapping away saves (if valid), Escape cancels.
 */
export const Nickname = ({ name, onSave }: Props) => {
  const { t } = useLingui();
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(name);
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    if (editing) {
      inputRef.current?.select();
    }
  }, [editing]);

  const error = validateNickname(draft);
  const errorText: Record<NicknameError, string> = {
    short: t`At least ${NICKNAME_MIN} characters`,
    long: t`At most ${NICKNAME_MAX} characters`,
    chars: t`Letters, digits, space, dot, dash and underscore only`,
  };

  const start = () => {
    setDraft(name);
    setEditing(true);
  };

  const finish = (save: boolean) => {
    if (save && !error) {
      const nickname = normalizeNickname(draft);

      if (nickname !== name) {
        onSave(nickname);
      }
    }

    setEditing(false);
  };

  if (!editing) {
    return (
      <span className={styles.nameRow}>
        <span className={styles.userName}>{name}</span>
        <button
          type="button"
          className={styles.editName}
          onClick={start}
          aria-label={t`Change nickname`}
          title={t`Change nickname`}
        >
          <Pencil size={13} strokeWidth={2.25} />
        </button>
      </span>
    );
  }

  return (
    <span className={styles.nameEdit}>
      <span className={styles.nameRow}>
        <input
          ref={inputRef}
          className={cn(styles.nameInput, error && styles.nameInputError)}
          value={draft}
          onChange={event => setDraft(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Enter') finish(true);
            if (event.key === 'Escape') finish(false);
          }}
          // Tapping away keeps a valid name, drops an invalid one.
          onBlur={() => finish(true)}
          maxLength={NICKNAME_MAX + 8}
          autoComplete="nickname"
          spellCheck={false}
          aria-label={t`Nickname`}
          aria-invalid={Boolean(error)}
        />
        <button
          type="button"
          className={styles.editName}
          // Before blur, so the click itself counts as "save".
          onMouseDown={event => event.preventDefault()}
          onClick={() => finish(true)}
          disabled={Boolean(error)}
          aria-label={t`Save`}
        >
          <Check size={14} strokeWidth={2.5} />
        </button>
      </span>
      {error ? (
        <span className={styles.nameError} role="status">
          {errorText[error]}
        </span>
      ) : null}
    </span>
  );
};
