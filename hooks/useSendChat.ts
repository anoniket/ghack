import { useAppStore } from '@/services/store';
import { extractUrlFromResponse, cleanResponseText } from '@/services/gemini';
import { sendChat } from '@/services/api';
import { rlog } from '@/services/logger';
import { nextMsgId as nextId } from '@/utils/ids';

// M31: Shared chat send logic — used by ChatInterface and ChatBubble
export function useSendChat() {
  const { addMessage, setIsTyping, setCurrentUrl, setMode, setChatBubbleExpanded } = useAppStore.getState();

  const send = async (text: string) => {
    const msg = text.trim();
    if (!msg) return;

    const isTyping = useAppStore.getState().isTyping;
    if (isTyping) return;

    addMessage({
      id: nextId('msg_user'),
      role: 'user',
      text: msg,
      timestamp: Date.now(),
    });

    setIsTyping(true);
    try {
      const freshMessages = useAppStore.getState().messages;
      const { text: response, url: serverUrl } = await sendChat(msg,
        freshMessages.slice(-15).map(m => ({ role: m.role, text: m.text }))
      );
      const url = serverUrl || extractUrlFromResponse(response);
      const cleaned = cleanResponseText(response);

      addMessage({
        id: nextId('msg_model'),
        role: 'model',
        text: cleaned || response,
        timestamp: Date.now(),
      });

      if (url) {
        rlog('Chat', `navigating to ${url}`);
        setTimeout(() => {
          setCurrentUrl(url);
          setMode('webview');
          setChatBubbleExpanded(false);
        }, 1500);
      }
    } catch (err) {
      rlog('Chat', `send error: ${err}`);
      addMessage({
        id: nextId('msg_error'),
        role: 'model',
        text: 'Sorry, I encountered an error. Please try again.',
        timestamp: Date.now(),
      });
    } finally {
      setIsTyping(false);
    }
  };

  return send;
}
