import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  useWindowDimensions,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useAppStore } from '@/services/store';
import { extractUrlFromResponse, cleanResponseText } from '@/services/gemini';
import { sendChat } from '@/services/api';
import { rlog } from '@/services/logger';
import { ChatMessage } from '@/services/store';

let msgCounter = 0;
const nextId = (prefix: string) => `${prefix}_${Date.now()}_${++msgCounter}`;

export default function ChatInterface() {
  const { width: W } = useWindowDimensions();
  const tabBarHeight = useBottomTabBarHeight();
  const [inputText, setInputText] = useState('');
  const flatListRef = useRef<FlatList>(null);
  const {
    messages,
    addMessage,
    isTyping,
    setIsTyping,
    setMode,
    setCurrentUrl,
    setChatBubbleExpanded,
  } = useAppStore();

  // PERF-17: Show hardcoded greeting immediately — no Gemini API wait on cold start
  useEffect(() => {
    if (messages.length === 0) {
      const greetings = [
        "Hey! What are we shopping for today? Drop a brand, a vibe, or just tell me what you need",
        "Yo! Ready to find something fire? Tell me what you're looking for",
        "Hey there! What's on the shopping list today? I work with any store in the world",
      ];
      addMessage({
        id: nextId('msg'),
        role: 'model',
        text: greetings[Math.floor(Math.random() * greetings.length)],
        timestamp: Date.now(),
      });
    }
  }, []);

  const handleSendText = async (text: string) => {
    if (!text.trim() || isTyping) return;
    const msg = text.trim();

    addMessage({
      id: nextId('msg_user'),
      role: 'user',
      text: msg,
      timestamp: Date.now(),
    });

    setIsTyping(true);
    try {
      // SS-2: Read fresh messages from store to avoid stale closure
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

  const handleSend = async () => {
    const text = inputText.trim();
    if (!text || isTyping) return;
    setInputText('');
    handleSendText(text);
  };

  const renderMessage = ({ item }: { item: ChatMessage }) => {
    const isUser = item.role === 'user';
    return (
      <View style={[styles.messageRow, isUser && styles.messageRowUser]}>
        {!isUser && (
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>AI</Text>
          </View>
        )}
        <View
          style={[
            styles.messageBubble,
            { maxWidth: W * 0.72 },
            isUser ? styles.userBubble : styles.aiBubble,
          ]}
        >
          <Text style={[styles.messageText, isUser && styles.userText]}>
            {item.text}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior="padding"
        keyboardVerticalOffset={0}
      >
        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderMessage}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.messagesList}
          onContentSizeChange={() =>
            flatListRef.current?.scrollToEnd({ animated: true })
          }
          ListHeaderComponent={
            <View style={styles.headerContainer}>
              <View style={styles.headerIconBg}>
                <Text style={styles.headerIcon}>AI</Text>
              </View>
              <Text style={styles.headerTitle}>mrigAI</Text>
              <Text style={styles.headerText}>
                Your universal shopping assistant
              </Text>
              <View style={styles.chipRow}>
                {[
                  { label: 'Nike', url: 'https://www.nike.com/in' },
                  { label: 'H&M', url: 'https://www2.hm.com/en_in/index.html' },
                  { label: 'Puma', url: 'https://in.puma.com/' },
                  { label: 'Snitch', url: 'https://www.snitch.com/' },
                  { label: 'Zara', url: 'https://www.zara.com/in/' },
                ].map((b) => (
                  <TouchableOpacity
                    key={b.label}
                    style={styles.chip}
                    onPress={() => {
                      setCurrentUrl(b.url);
                      setMode('webview');
                      setChatBubbleExpanded(false);
                    }}
                  >
                    <Text style={styles.chipText}>{b.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          }
          ListFooterComponent={
            isTyping ? (
              <View style={[styles.messageRow]}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>AI</Text>
                </View>
                <View style={[styles.messageBubble, styles.aiBubble]}>
                  <View style={styles.typingDots}>
                    <View style={[styles.dot, styles.dot1]} />
                    <View style={[styles.dot, styles.dot2]} />
                    <View style={[styles.dot, styles.dot3]} />
                  </View>
                </View>
              </View>
            ) : null
          }
        />

        <View style={[styles.inputWrapper, { paddingBottom: tabBarHeight }]}>
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              placeholder="What do you want to shop today?"
              placeholderTextColor="rgba(255,255,255,0.25)"
              value={inputText}
              onChangeText={setInputText}
              onSubmitEditing={handleSend}
              returnKeyType="send"
              multiline={false}
            />
            <TouchableOpacity
              onPress={handleSend}
              disabled={!inputText.trim() || isTyping}
              activeOpacity={0.7}
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D0D0D',
  },
  flex: {
    flex: 1,
  },
  messagesList: {
    padding: 16,
    paddingBottom: 8,
    flexGrow: 1,
    justifyContent: 'flex-end',
  },
  messageRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: 16,
    gap: 10,
  },
  messageRowUser: {
    justifyContent: 'flex-end',
  },
  avatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
    backgroundColor: '#E8C8A0',
  },
  avatarText: {
    color: '#0D0D0D',
    fontSize: 10,
    fontWeight: '800',
  },
  messageBubble: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 20,
  },
  userBubble: {
    backgroundColor: '#F5F5F5',
    borderBottomRightRadius: 6,
    marginLeft: 'auto',
  },
  aiBubble: {
    backgroundColor: '#1A1A1A',
    borderBottomLeftRadius: 6,
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  messageText: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.85)',
    lineHeight: 22,
  },
  userText: {
    color: '#0D0D0D',
  },
  typingDots: {
    flexDirection: 'row',
    gap: 5,
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  dot1: { opacity: 0.4 },
  dot2: { opacity: 0.6 },
  dot3: { opacity: 0.8 },
  inputWrapper: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1A1A',
    borderRadius: 28,
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.08)',
    paddingLeft: 20,
    paddingRight: 6,
    paddingVertical: 6,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: '#F5F5F5',
    paddingVertical: 10,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
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
    fontSize: 20,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.3)',
  },
  sendBtnTextActive: {
    color: '#0D0D0D',
  },
  headerContainer: {
    alignItems: 'center',
    paddingTop: 32,
    paddingBottom: 24,
    marginBottom: 8,
  },
  headerIconBg: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    backgroundColor: '#E8C8A0',
  },
  headerIcon: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0D0D0D',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#F5F5F5',
    marginBottom: 6,
    letterSpacing: 0.5,
  },
  headerText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.35)',
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 20,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#1A1A1A',
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  chipText: {
    color: '#E8C8A0',
    fontSize: 13,
    fontWeight: '600',
  },
});
