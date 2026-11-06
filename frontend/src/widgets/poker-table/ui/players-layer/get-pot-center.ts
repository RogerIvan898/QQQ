export const getPotCenter = (tableElement: HTMLElement, tableRect: DOMRect) => {
  const potRect = tableElement
    .querySelector('[data-pot]')
    ?.getBoundingClientRect();

  if (!potRect) {
    return { x: tableRect.width / 2, y: tableRect.height / 2 };
  }

  return {
    x: potRect.left - tableRect.left + potRect.width / 2,
    y: potRect.top - tableRect.top + potRect.height / 2,
  };
};
