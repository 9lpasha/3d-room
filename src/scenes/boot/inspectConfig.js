export const INSPECTABLES = {
  books: {
    parent: "Books",
    text: "JavaScript for Beginners: 847 pages. You read 3.",
  },
  bed: {
    parent: "Bed",
    text: "You probably won't get much sleep anymore.",
  },
  laptop: {
    parent: "Mac",
    text: "Maybe I should learn programming.",
  },
  mug: {
    parent: "Coffee",
    text: "Coffee. Your first dependency.",
  },
};

const PARENT_TO_ID = new Map(
  Object.entries(INSPECTABLES).map(([id, item]) => [item.parent, id]),
);

export function inspectIds() {
  return Object.keys(INSPECTABLES);
}

export function inspectText(id) {
  return INSPECTABLES[id]?.text ?? "";
}

export function inspectIdByParent(name) {
  return PARENT_TO_ID.get(name) ?? null;
}
