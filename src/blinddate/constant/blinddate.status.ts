export type BLIND_DATE_STATUS_TYPE =
  (typeof BLIND_DATE_STATUS)[keyof typeof BLIND_DATE_STATUS];

export const BLIND_DATE_STATUS = {
  OPEN: 'open',
  CLOSE: 'close',
} as const;
