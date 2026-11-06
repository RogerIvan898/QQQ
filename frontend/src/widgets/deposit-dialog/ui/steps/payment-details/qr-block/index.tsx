import { QRCodeSVG } from 'qrcode.react';

import styles from './qr-block.module.css';

interface Props {
  value: string;
  hint: string;
}

export const QrBlock = ({ value, hint }: Props) => (
  <div className={styles.qrBlock}>
    <div className={styles.qr}>
      <QRCodeSVG value={value} size={170} level="M" />
    </div>
    <p className={styles.qrHint}>{hint}</p>
  </div>
);
