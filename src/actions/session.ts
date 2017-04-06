import safeCreateAction from './safeCreateAction';

/**
 * action to choose which item in a group to display (all other items in the
 * group will be hidden). the itemId can be undefined to hide them all.
 */
export const displayGroup = safeCreateAction('DISPLAY_GROUP',
  (groupId: string, itemId?: string) => ({ groupId, itemId }));

/**
 * open the overlay for the current page
 */
export const setOverlayOpen = safeCreateAction('SET_OVERLAY_OPEN',
  (open: boolean) => ({ open }));
