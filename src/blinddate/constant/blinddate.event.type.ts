export type EVENT_TYPES = (typeof EVENT_TYPE)[keyof typeof EVENT_TYPE];

export const EVENT_TYPE = {
  FREEZE: 'freeze',
  SYSTEM: 'system',
  BOARDCAST: 'broadcast',
  THAW: 'thaw',
  CREATE_CHATROOM: 'create_chat',
} as const;
