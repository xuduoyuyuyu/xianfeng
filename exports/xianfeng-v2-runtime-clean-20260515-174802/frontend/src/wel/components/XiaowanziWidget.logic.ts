export const XIAOWANZI_AVATARS = [
  "/assets/wel-avatar/no-hat.png",
  "/assets/wel-avatar/IMG_0640.png",
  "/assets/wel-avatar/小玩子-巫师.png",
  "/assets/wel-avatar/image_20260319153410_b887983024608ab90c0da59061374081.png",
  "/assets/wel-avatar/image_20260319153421_e614f88a4edf43cc2860c5df6d066877.png",
  "/assets/wel-avatar/image_20260320082808_ff0c0d1c25422e4dbdc000e4caee5634.png",
  "/assets/wel-avatar/image_20260320082829_e686bfb5b113ab8244756a0abf68bd80.png",
  "/assets/wel-avatar/image_20260320082902_a1994868c0566a4334bb2d677cc8b715.png",
  "/assets/wel-avatar/image_20260320082917_b46b50e457169796d937557c1d3986a9.png",
  "/assets/wel-avatar/image_20260320083958_3b451452b1e48a9f004fe6d752f56730.png",
  "/assets/wel-avatar/image_20260320091309_3a25356faa55e01bee83ca8729af9e4e.png",
  "/assets/wel-avatar/image_20260320091826_97cbbdadb598fa6110f53acf058f8927.png",
  "/assets/wel-avatar/image_20260320091829_0e6348609a981cdeb2e2db355a1ae602.png",
  "/assets/wel-avatar/image_20260320103520_4713665d1090084b4c7ac5d44c6a325f.png",
  "/assets/wel-avatar/image_20260326194617_0e741ab7740b6d95a9775570b91d1e53.png",
  "/assets/wel-avatar/image_20260326194629_f48d3b2a6334555e9d0d0c280e0d28fc.png",
  "/assets/wel-avatar/image_20260326195256_8d9a36411c02e77558dfc85050cfbeae.png",
  "/assets/wel-avatar/image_20260326195304_cb4661cb9ed8a1a486ea1fe389fa2b04.png",
  "/assets/wel-avatar/image_20260326195307_30e9a34ba02cab4d019697018e844038.png",
  "/assets/wel-avatar/image_20260326200218_0b7cef10e5f487c19578d533a5c75c43.png",
  "/assets/wel-avatar/image_20260326200731_97b6e2af5eef15dc941f60dd2de266d7.png",
  "/assets/wel-avatar/image_20260327000818_79c1cacdc9ceb0cf646a139d3f1045b9.png",
] as const;

export const FAB_SIZE = 48;
export const FAB_MARGIN = 28;
const FAB_BOUNDS_PADDING = 12;
const AVATAR_SWITCH_CLICKS = 5;

export type FabPosition = { left: number; top: number };
export type AvatarState = { avatarIndex: number; clickCount: number };

export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function getDefaultFabPosition(viewportWidth: number, viewportHeight: number): FabPosition {
  return {
    left: Math.max(FAB_MARGIN, viewportWidth - FAB_SIZE - FAB_MARGIN),
    top: Math.max(FAB_MARGIN, viewportHeight - FAB_SIZE - FAB_MARGIN),
  };
}

export function clampFabPosition(position: FabPosition, viewportWidth: number, viewportHeight: number): FabPosition {
  return {
    left: clamp(position.left, FAB_BOUNDS_PADDING, Math.max(FAB_BOUNDS_PADDING, viewportWidth - FAB_SIZE - FAB_BOUNDS_PADDING)),
    top: clamp(position.top, FAB_BOUNDS_PADDING, Math.max(FAB_BOUNDS_PADDING, viewportHeight - FAB_SIZE - FAB_BOUNDS_PADDING)),
  };
}

export function getAvatarSrc(index: number) {
  return XIAOWANZI_AVATARS[index] || XIAOWANZI_AVATARS[0];
}

export function advanceAvatarState(state: AvatarState): AvatarState {
  const nextClickCount = state.clickCount + 1;
  if (nextClickCount < AVATAR_SWITCH_CLICKS) {
    return { avatarIndex: state.avatarIndex, clickCount: nextClickCount };
  }
  return {
    avatarIndex: (state.avatarIndex + 1) % XIAOWANZI_AVATARS.length,
    clickCount: 0,
  };
}
