import { nextMsgId } from '@/utils/ids';

describe('nextMsgId', () => {
  it('generates IDs with the given prefix', () => {
    const id = nextMsgId('msg');
    expect(id).toMatch(/^msg_\d+_\d+$/);
  });

  it('generates unique IDs on subsequent calls', () => {
    const id1 = nextMsgId('test');
    const id2 = nextMsgId('test');
    expect(id1).not.toBe(id2);
  });

  it('supports different prefixes', () => {
    const userMsg = nextMsgId('msg_user');
    const modelMsg = nextMsgId('msg_model');
    expect(userMsg).toMatch(/^msg_user_/);
    expect(modelMsg).toMatch(/^msg_model_/);
  });

  it('increments the counter part', () => {
    const id1 = nextMsgId('x');
    const id2 = nextMsgId('x');
    // Extract counter (last segment)
    const counter1 = parseInt(id1.split('_').pop()!, 10);
    const counter2 = parseInt(id2.split('_').pop()!, 10);
    expect(counter2).toBe(counter1 + 1);
  });
});
