export const getTargetControls = (targetType: string): string[] => {
  switch (targetType) {
    case "text":
      return ["nw", "n", "ne", "w", "e", "sw", "s", "se"];
    case "caption":
      return ["nw", "n", "ne", "w", "e", "sw", "s", "se"];
    case "image":
    case "video":
      return ["nw", "n", "ne", "w", "e", "sw", "s", "se"];
    case "svg":
      return ["nw", "n", "ne", "w", "e", "sw", "s", "se"];
    case "group":
      return ["nw", "ne", "sw", "se"];
    default:
      return ["nw", "ne", "sw", "se"];
  }
};

interface ITargetAbles {
  rotatable: boolean;
  resizable: boolean;
  scalable: boolean;
  keepRatio: boolean;
  draggable: boolean;
  snappable: boolean;
}

export const getTargetAbles = (targetType: string): ITargetAbles => {
  switch (targetType) {
    case "text":
      return {
        rotatable: true,
        resizable: true,
        scalable: false,
        keepRatio: false,
        draggable: true,
        snappable: true
      };
    case "caption":
      return {
        rotatable: true,
        resizable: true,
        scalable: false,
        keepRatio: false,
        draggable: true,
        snappable: true
      };
    case "image":
    case "video":
      return {
        rotatable: true,
        resizable: true,
        scalable: false,
        keepRatio: true,
        draggable: true,
        snappable: true
      };
    case "group":
      return {
        rotatable: false,
        resizable: false,
        scalable: true,
        keepRatio: true,
        draggable: true,
        snappable: true
      };
    case "svg":
      return {
        rotatable: true,
        resizable: false,
        scalable: true,
        keepRatio: true,

        draggable: true,
        snappable: true
      };
    default:
      return {
        rotatable: true,
        resizable: false,
        scalable: true,
        keepRatio: true,
        draggable: true,
        snappable: true
      };
  }
};

export const getTypeFromClassName = (input: string): string | null => {
  const regex = /designcombo-scene-item-type-([^ ]+)/;
  const match = input.match(regex);
  return match ? match[1] : null;
};

export interface SelectionInfo {
  targets: HTMLElement[];
  layerType: string | null;
  ables: ITargetAbles;
  controls: string[];
}

export const emptySelection: SelectionInfo = {
  targets: [],
  layerType: null,
  ables: {
    rotatable: false,
    resizable: false,
    scalable: false,
    keepRatio: false,
    draggable: true,
    snappable: true
  },
  controls: []
};

function escapeId(id: string): string {
  return typeof CSS !== "undefined" && CSS.escape ? CSS.escape(id) : id;
}

export const getSelectionByIds = (
  ids: string[],
  trackItemsMap?: Record<string, { type: string; metadata?: Record<string, unknown> }>
): SelectionInfo => {
  if (!ids || ids.length === 0) return emptySelection;

  const targets = ids
    .map((id) => {
      if (!id) return null;
      const element = document.querySelector<HTMLElement>(
        `.designcombo-scene-item.id-${escapeId(id)}`
      );
      return element;
    })
    .filter((target): target is HTMLElement => target !== null)
    .filter((target) => {
      const targetType = getTypeFromClassName(target.className)!;
      return targetType !== "audio";
    });

  if (targets.length === 0) return emptySelection;

  const anyLocked =
    trackItemsMap &&
    ids.some((id) => Boolean(trackItemsMap[id]?.metadata?.locked));

  const lockAbles = anyLocked
    ? {
        rotatable: false,
        resizable: false,
        scalable: false,
        keepRatio: false,
        draggable: false,
        snappable: false
      }
    : null;

  if (targets.length === 1) {
    const target = targets[0];
    const targetType = getTypeFromClassName(target.className)!;
    const ables = lockAbles ?? getTargetAbles(targetType);
    const controls = anyLocked ? [] : getTargetControls(targetType);
    return { targets: [target], layerType: targetType, ables, controls };
  }

  return {
    targets,
    layerType: "group",
    ables: lockAbles ?? getTargetAbles("group"),
    controls: anyLocked ? [] : []
  };
};

export const getTargetById = (id: string): HTMLElement | null => {
  const element = document.querySelector<HTMLElement>(
    `.designcombo-scene-item.id-${escapeId(id)}`
  );
  return element;
};
