export const BlindDateQueue = {
  ENTER: 'ENTER',
  LEAVE: 'LEAVE',
  CHOICE: 'CHOICE',
} as const;

export type BlindDateQueueType =
  (typeof BlindDateQueue)[keyof typeof BlindDateQueue];
