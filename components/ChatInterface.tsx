import React, { useState, useRef, useEffect, useCallback, memo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  useWindowDimensions,
  ActivityIndicator,
  Image,
  Platform,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppStore } from '@/services/store';
import { ChatMessage } from '@/services/store';
import { nextMsgId as nextId } from '@/utils/ids';
import { useSendChat } from '@/hooks/useSendChat';
import { usePostHog } from 'posthog-react-native';
import { ANALYTICS_EVENTS } from '@/utils/analytics';
import { COLORS, FONTS, SHADOWS, BORDER_RADIUS, BORDERS, SPACING } from '@/theme';

// M28: Memoized message bubble — only re-renders when its own item changes
const MessageBubble = memo(({ item, maxWidth }: { item: ChatMessage; maxWidth: number }) => {
  const isUser = item.role === 'user';
  return (
    <View style={[styles.messageRow, isUser && styles.messageRowUser]}>
      {!isUser && (
        <View style={styles.avatar}>
          <Image source={require('@/assets/images/mm.png')} style={styles.avatarLogo} resizeMode="contain" />
        </View>
      )}
      <View
        style={[
          styles.messageBubble,
          { maxWidth },
          isUser ? styles.userBubble : styles.aiBubble,
        ]}
      >
        <Text style={[styles.messageText, isUser && styles.userText]}>
          {item.text}
        </Text>
      </View>
    </View>
  );
});

export default function ChatInterface() {
  const { width: W } = useWindowDimensions();
  const tabBarHeight = useBottomTabBarHeight();
  const insets = useSafeAreaInsets();
  const [inputText, setInputText] = useState('');
  const flatListRef = useRef<FlatList>(null);
  // PLAT-17: Track scroll position — only auto-scroll when near bottom
  const isNearBottom = useRef(true);
  const messages = useAppStore((s) => s.messages);
  const isTyping = useAppStore((s) => s.isTyping);
  const addMessage = useAppStore.getState().addMessage;
  const { setCurrentUrl, setMode, setChatBubbleExpanded } = useAppStore.getState();
  const posthog = usePostHog();
  const sendChat = useSendChat();

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

  const handleSend = async () => {
    const text = inputText.trim();
    if (!text || isTyping) return;
    setInputText('');
    posthog?.capture(ANALYTICS_EVENTS.CHAT_MESSAGE_SENT);
    sendChat(text);
  };

  const maxBubbleWidth = W * 0.72;
  const renderMessage = useCallback(
    ({ item }: { item: ChatMessage }) => <MessageBubble item={item} maxWidth={maxBubbleWidth} />,
    [maxBubbleWidth]
  );

  return (
    <View style={styles.container}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior="padding"
        keyboardVerticalOffset={-tabBarHeight}
      >
        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderMessage}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.messagesList}
          onScroll={({ nativeEvent }) => {
            const { layoutMeasurement, contentOffset, contentSize } = nativeEvent;
            isNearBottom.current = contentOffset.y + layoutMeasurement.height >= contentSize.height - 80;
          }}
          scrollEventThrottle={100}
          onContentSizeChange={() => {
            if (isNearBottom.current) flatListRef.current?.scrollToEnd({ animated: true });
          }}
          ListHeaderComponent={
            <View style={[styles.headerContainer, { paddingTop: insets.top + SPACING.xxl }]}>
              <Text style={styles.headline}>
                ask me{'\n'}<Text style={styles.headlineAccent}>anything.</Text>
              </Text>
              <Text style={styles.subtitle}>
                i can open any website or help you find what to wear.
              </Text>
            </View>
          }
          ListFooterComponent={
            isTyping ? (
              <View style={[styles.messageRow]}>
                <View style={styles.avatar}>
                  <Image source={require('@/assets/images/mm.png')} style={styles.avatarLogo} resizeMode="contain" />
                </View>
                <View style={[styles.messageBubble, styles.aiBubble]}>
                  <ActivityIndicator size="small" color={COLORS.primaryContainer} />
                </View>
              </View>
            ) : null
          }
        />

        <View style={[styles.inputWrapper, { paddingBottom: tabBarHeight + SPACING.sm }]}>
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              placeholder="ask me anything..."
              placeholderTextColor={COLORS.onSurfaceVariant + '80'}
              value={inputText}
              onChangeText={setInputText}
              onSubmitEditing={handleSend}
              returnKeyType="send"
              multiline={false}
              accessibilityLabel="Chat message input"
              accessibilityHint="Type a message to the shopping assistant"
            />
            <TouchableOpacity
              onPress={handleSend}
              disabled={!inputText.trim() || isTyping}
              activeOpacity={0.7}
              accessibilityLabel="Send message"
              accessibilityRole="button"
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
    backgroundColor: COLORS.background,
  },
  flex: {
    flex: 1,
  },
  messagesList: {
    padding: SPACING.lg,
    paddingBottom: SPACING.sm,
    flexGrow: 1,
    justifyContent: 'flex-end',
  },

  // Header
  headerContainer: {
    paddingBottom: SPACING.xl,
    marginBottom: SPACING.sm,
    gap: SPACING.sm,
  },
  headline: {
    fontFamily: FONTS.headline,
    fontSize: 44,
    color: COLORS.onSurface,
    letterSpacing: -2,
    lineHeight: 44,
    textTransform: 'lowercase',
  },
  headlineAccent: {
    color: COLORS.primary,
  },
  subtitle: {
    fontFamily: FONTS.body,
    fontSize: 15,
    color: COLORS.onSurfaceVariant,
    lineHeight: 22,
  },

  // Message rows
  messageRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: SPACING.lg,
    gap: SPACING.sm,
  },
  messageRowUser: {
    justifyContent: 'flex-end',
  },

  // AI avatar — square neo-brutalist
  avatar: {
    width: 28,
    height: 28,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: BORDERS.medium,
    borderColor: COLORS.onSurface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
    backgroundColor: COLORS.primaryContainer,
  },
  avatarLogo: {
    width: 18,
    height: 18,
  },

  // Bubbles
  messageBubble: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: BORDERS.medium,
    borderColor: COLORS.onSurface,
  },
  userBubble: {
    backgroundColor: COLORS.primaryContainer,
    marginLeft: 'auto',
    ...SHADOWS.hardSmall,
    ...Platform.select({ android: { elevation: 3 } }),
  },
  aiBubble: {
    backgroundColor: COLORS.surfaceContainerLowest,
    ...SHADOWS.hardSmall,
    ...Platform.select({ android: { elevation: 3 } }),
  },
  messageText: {
    fontFamily: FONTS.body,
    fontSize: 15,
    color: COLORS.onSurface,
    lineHeight: 22,
  },
  userText: {
    color: COLORS.onPrimary,
  },

  // Input area
  inputWrapper: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.sm,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceContainerLowest,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: BORDERS.medium,
    borderColor: COLORS.onSurface,
    paddingLeft: SPACING.lg,
    paddingRight: SPACING.xs + 2,
    paddingVertical: SPACING.xs + 2,
  },
  input: {
    flex: 1,
    fontFamily: FONTS.body,
    fontSize: 15,
    color: COLORS.onSurface,
    paddingVertical: SPACING.sm + 2,
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: BORDER_RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnActive: {
    backgroundColor: COLORS.primaryContainer,
  },
  sendBtnInactive: {
    backgroundColor: COLORS.surfaceContainerHigh,
  },
  sendBtnText: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.onSurfaceVariant,
  },
  sendBtnTextActive: {
    color: COLORS.onPrimary,
  },
});
