// PLAT-6: Shared message ID generator — used by ChatInterface
let msgCounter = 0;
export const nextMsgId = (prefix: string) => `${prefix}_${Date.now()}_${++msgCounter}`;
