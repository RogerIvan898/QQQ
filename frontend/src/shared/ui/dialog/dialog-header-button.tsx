import styles from './dialog.module.css';

interface Props {
  onClick: () => void;
  ariaLabel: string;
}

export const DialogHeaderButton = ({
  onClick,
  ariaLabel,
  children,
}: React.PropsWithChildren<Props>) => (
  <div className={styles.headerSide}>
    <button
      type="button"
      className={styles.iconBtn}
      onClick={onClick}
      aria-label={ariaLabel}
    >
      {children}
    </button>
  </div>
);
