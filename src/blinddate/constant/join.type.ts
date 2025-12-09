export type JoinType = (typeof JoinStatus)[keyof typeof JoinStatus];

export const JoinStatus = {
  FIRST: 'FIRST',
  DUPLICATE: 'DUPLICATE',
};
