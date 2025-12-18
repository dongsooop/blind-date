export const queueConfig = () => {
  const getSessionQueueKey = () => {
    const sessionQueueKey = process.env.SESSION_QUEUE_KEY;
    if (!sessionQueueKey) {
      throw new Error(`No session queue key found`);
    }

    return sessionQueueKey;
  };

  const getChoiceQueueKey = () => {
    const choiceQueueKey = process.env.CHOICE_QUEUE_KEY;
    if (!choiceQueueKey) {
      throw new Error(`No choice queue key found`);
    }

    return choiceQueueKey;
  };

  const getRedisKeyPrefix = () => {
    const redisKeyPrefix = process.env.REDIS_KEY_PREFIX;
    if (!redisKeyPrefix) {
      throw new Error(`No redis key prefix found`);
    }

    return redisKeyPrefix;
  };

  const getStartMessageDelay = () => {
    const startMessageDelay = Number(process.env.START_MESSAGE_DELAY);
    if (isNaN(startMessageDelay)) {
      return 2 * 1000;
    }

    return startMessageDelay;
  };

  const getChoiceTime = () => {
    const choiceTime = Number(process.env.CHOICE_TIME);
    if (isNaN(choiceTime)) {
      return 10 * 1000;
    }

    return choiceTime;
  };

  const getChattingTime = () => {
    const chattingTime = Number(process.env.CHATTING_TIME);
    if (isNaN(chattingTime)) {
      return 3 * 60 * 1000;
    }

    return chattingTime;
  };

  const getMessageWaitingTime = () => {
    const messageWaitingTime = Number(process.env.MESSAGE_WAITING_TIME);
    if (isNaN(messageWaitingTime)) {
      return 4 * 1000;
    }

    return messageWaitingTime;
  };

  const getSessionManagerName = () => {
    const sessionManagerName = process.env.SESSION_MANAGER_NAME;
    if (!sessionManagerName) {
      return '동냥이';
    }

    return sessionManagerName;
  };

  return {
    getChoiceQueueKey,
    getSessionQueueKey,
    getRedisKeyPrefix,
    getStartMessageDelay,
    getChoiceTime,
    getChattingTime,
    getMessageWaitingTime,
    getSessionManagerName,
  };
};
