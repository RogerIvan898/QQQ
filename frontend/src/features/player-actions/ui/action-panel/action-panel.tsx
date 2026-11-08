import { BaseActions } from '../base-actions';
import { FoldedNotice } from '../folded-notice';
import { PreActions } from '../pre-actions';
import { SitOutNotice } from '../sit-out-notice';

interface Props {
  isMyTurn: boolean;
  showPreActions: boolean;
  hasFolded: boolean;
  sittingOut: boolean;
  returning: boolean;
  canFold: boolean;
  canCall: boolean;
  canRaise: boolean;
  isBet: boolean;
  callAmount: number;
  onRaiseClick: () => void;
}

export const ActionPanel = ({
  isMyTurn,
  showPreActions,
  hasFolded,
  sittingOut,
  returning,
  canFold,
  canCall,
  canRaise,
  isBet,
  callAmount,
  onRaiseClick,
}: Props) => {
  if (isMyTurn) {
    return (
      <BaseActions
        canFold={canFold}
        canCall={canCall}
        canRaise={canRaise}
        isBet={isBet}
        callAmount={callAmount}
        onRaiseClick={onRaiseClick}
      />
    );
  }

  if (sittingOut) {
    return <SitOutNotice returning={returning} />;
  }

  if (hasFolded) {
    return <FoldedNotice />;
  }

  if (showPreActions) {
    return <PreActions />;
  }

  return null;
};
