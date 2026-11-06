import { BaseActions } from '../base-actions';
import { FoldedNotice } from '../folded-notice';
import { PreActions } from '../pre-actions';

interface Props {
  isMyTurn: boolean;
  showPreActions: boolean;
  hasFolded: boolean;
  canFold: boolean;
  canCall: boolean;
  canRaise: boolean;
  isBet: boolean;
  onRaiseClick: () => void;
}

export const ActionPanel = ({
  isMyTurn,
  showPreActions,
  hasFolded,
  canFold,
  canCall,
  canRaise,
  isBet,
  onRaiseClick,
}: Props) => {
  if (isMyTurn) {
    return (
      <BaseActions
        canFold={canFold}
        canCall={canCall}
        canRaise={canRaise}
        isBet={isBet}
        onRaiseClick={onRaiseClick}
      />
    );
  }

  if (hasFolded) {
    return <FoldedNotice />;
  }

  if (showPreActions) {
    return <PreActions />;
  }

  return null;
};
