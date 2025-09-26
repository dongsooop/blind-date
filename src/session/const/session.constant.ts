export type SESSION_STATE_TYPE =
  (typeof SESSION_STATE)[keyof typeof SESSION_STATE];

export const SESSION_STATE = {
  WAITING: 'waiting',
  PROCESSING: 'processing',
  ENDED: 'ended',
} as const;
