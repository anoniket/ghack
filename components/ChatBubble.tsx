import React, { useState, useRef, useCallback, memo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  FlatList,
  useWindowDimensions,
  ActivityIndicator,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppStore } from '@/services/store';
import { extractUrlFromResponse, cleanResponseText } from '@/services/gemini';
import { sendChat } from '@/services/api';
import { rlog } from '@/services/logger';
import { ChatMessage } from '@/services/store';
import { nextMsgId as nextId } from '@/utils/ids';

// PERF-5: Memoized message bubble — only re-renders when its own item changes
const MessageBubble = memo(({ item }: { item: ChatMessage }) => (
  <View
    style={[
      styles.msg,
      item.role === 'user' ? styles.userMsg : styles.aiMsg,
    ]}
  >
    <Text
      style={[
        styles.msgText,
        item.role === 'user' && styles.userMsgText,
      ]}
    >
      {item.text}
    </Text>
  </View>
));

export default function ChatBubble() {
  const { height: SCREEN_HEIGHT } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const tabBarHeight = 58 + insets.bottom; // matches _layout.tsx tab bar
  const [inputText, setInputText] = useState('');

  // PERF-6: Individual selectors — collapsed bubble doesn't re-render on message changes
  const chatBubbleExpanded = useAppStore((s) => s.chatBubbleExpanded);
  const messages = useAppStore((s) => s.messages);
  const isTyping = useAppStore((s) => s.isTyping);
  const tryOnLoading = useAppStore((s) => s.tryOnLoading);
  const videoLoading = useAppStore((s) => s.videoLoading);

  const { addMessage, setIsTyping, setCurrentUrl, setChatBubbleExpanded } = useAppStore.getState();
  const flatListRef = useRef<FlatList>(null);

  const handleSend = async () => {
    const text = inputText.trim();
    if (!text || isTyping) return;
    setInputText('');

    addMessage({
      id: nextId('msg_user'),
      role: 'user',
      text,
      timestamp: Date.now(),
    });

    setIsTyping(true);
    try {
      // SS-2: Read fresh messages from store — closure `messages` is stale after addMessage
      const freshMessages = useAppStore.getState().messages;
      const { text: response, url: serverUrl } = await sendChat(text,
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
        rlog('Chat', `bubble navigating to ${url}`);
        setTimeout(() => {
          setCurrentUrl(url);
          setChatBubbleExpanded(false);
        }, 1000);
      }
    } catch (err) {
      rlog('Chat', `bubble send error: ${err}`);
      addMessage({
        id: nextId('msg_error'),
        role: 'model',
        text: 'Sorry, an error occurred.',
        timestamp: Date.now(),
      });
    } finally {
      setIsTyping(false);
    }
  };

  // PERF-6: Stable renderItem reference
  const renderMessage = useCallback(
    ({ item }: { item: ChatMessage }) => <MessageBubble item={item} />,
    []
  );

  const isGenerating = tryOnLoading || videoLoading;

  // Hide bubble & collapse expanded panel during try-on or video generation
  if (isGenerating) return null;

  if (!chatBubbleExpanded) {
    return (
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => setChatBubbleExpanded(true)}
      >
        <View style={[styles.bubble, { bottom: tabBarHeight + 16 }]}>
          <Text style={styles.bubbleIcon}>AI</Text>
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.expandedContainer, { bottom: tabBarHeight }]}
      behavior="padding"
    >
      <View style={[styles.expandedPanel, { height: SCREEN_HEIGHT * 0.48 }]}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.headerDot}>
              <Text style={styles.headerDotText}>AI</Text>
            </View>
            <Text style={styles.headerTitle}>mrigAI</Text>
          </View>
          <TouchableOpacity
            onPress={() => setChatBubbleExpanded(false)}
            style={styles.closeBtn}
          >
            <Text style={styles.closeBtnText}>{'\u2715'}</Text>
          </TouchableOpacity>
        </View>

        {/* Messages */}
        <FlatList
          ref={flatListRef}
          data={messages.slice(-20)}
          renderItem={renderMessage}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.msgList}
          onContentSizeChange={() =>
            flatListRef.current?.scrollToEnd({ animated: true })
          }
          ListFooterComponent={
            isTyping ? (
              <View style={[styles.msg, styles.aiMsg]}>
                <ActivityIndicator size="small" color="#E8C8A0" />
              </View>
            ) : null
          }
        />

        {/* Input */}
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            placeholder="Ask about products..."
            placeholderTextColor="rgba(255,255,255,0.25)"
            value={inputText}
            onChangeText={setInputText}
            onSubmitEditing={handleSend}
            returnKeyType="send"
          />
          <TouchableOpacity
            onPress={handleSend}
            disabled={!inputText.trim() || isTyping}
          >
            <View
              style={[
                styles.sendBtn,
                inputText.trim()
                  ? styles.sendBtnActive
                  : styles.sendBtnInactive,
              ]}
            >
              <Text
                style={[
                  styles.sendBtnText,
                  inputText.trim() && styles.sendBtnTextActive,
                ]}
              >
                ↑
              </Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  bubble: {
    position: 'absolute',
    right: 16,
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E8C8A0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 100,
  },
  bubbleIcon: {
    color: '#0D0D0D',
    fontSize: 14,
    fontWeight: '900',
  },
  expandedContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 100,
  },
  expandedPanel: {
    backgroundColor: '#141414',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    overflow: 'hidden',
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.06)',
    borderBottomWidth: 0.5,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerDot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E8C8A0',
  },
  headerDotText: {
    color: '#0D0D0D',
    fontSize: 9,
    fontWeight: '800',
  },
  headerTitle: {
    color: '#F5F5F5',
    fontSize: 15,
    fontWeight: '700',
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#1A1A1A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 14,
  },
  msgList: {
    padding: 14,
    flexGrow: 1,
  },
  msg: {
    maxWidth: '80%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
    marginBottom: 8,
  },
  userMsg: {
    backgroundColor: '#F5F5F5',
    alignSelf: 'flex-end',
    borderBottomRightRadius: 4,
  },
  aiMsg: {
    backgroundColor: '#1A1A1A',
    alignSelf: 'flex-start',
    borderBottomLeftRadius: 4,
  },
  msgText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 14,
    lineHeight: 20,
  },
  userMsgText: {
    color: '#0D0D0D',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    paddingBottom: 14,
    borderTopWidth: 0.5,
    borderTopColor: 'rgba(255,255,255,0.06)',
    gap: 8,
  },
  input: {
    flex: 1,
    backgroundColor: '#1A1A1A',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 14,
    color: '#F5F5F5',
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnActive: {
    backgroundColor: '#E8C8A0',
  },
  sendBtnInactive: {
    backgroundColor: '#242424',
  },
  sendBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.3)',
  },
  sendBtnTextActive: {
    color: '#0D0D0D',
  },
});
