import React, { useState, useCallback, useRef, memo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  Alert,
  Dimensions,
  RefreshControl,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { useVideoPlayer } from 'expo-video';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { MaterialIcons } from '@expo/vector-icons';
import VideoModal from '@/components/VideoModal';
import { useAppStore, SavedTryOn } from '@/services/store';
import * as api from '@/services/api';
import { mapHistoryItem } from '@/utils/imageUtils';
import { usePostHog } from 'posthog-react-native';
import { ANALYTICS_EVENTS, getStoreName as getStoreNameFromUrl } from '@/utils/analytics';
import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system/legacy';
import { COLORS, FONTS, SHADOWS, BORDER_RADIUS, BORDERS, SPACING, getStoreAccentColor, getStoreLogo } from '@/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const GRID_GAP = 12;
const CARD_WIDTH = (SCREEN_WIDTH - SPACING.xl * 2 - GRID_GAP) / 2;
const CARD_HEIGHT = CARD_WIDTH * 1.5;

function getStoreName(url?: string): string {
  if (!url) return 'try-on';
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    const name = host.split('.')[0];
    return name;
  } catch {
    return 'try-on';
  }
}

interface TimelineSection {
  title: string;
  data: SavedTryOn[];
}

function groupByTimeline(items: SavedTryOn[]): TimelineSection[] {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterday = today - 86400000;
  const thisWeek = today - 7 * 86400000;

  const groups: Record<string, SavedTryOn[]> = {
    today: [],
    yesterday: [],
    'this week': [],
    earlier: [],
  };

  for (const item of items) {
    const ts = item.timestamp;
    if (ts >= today) groups.today.push(item);
    else if (ts >= yesterday) groups.yesterday.push(item);
    else if (ts >= thisWeek) groups['this week'].push(item);
    else groups.earlier.push(item);
  }

  return Object.entries(groups)
    .filter(([, items]) => items.length > 0)
    .map(([title, data]) => ({ title, data }));
}

// Card with neo-brutalist style — image + store name + delete
const TryOnCard = memo(function TryOnCard({ item, onPress, onDelete }: {
  item: SavedTryOn;
  onPress: () => void;
  onDelete: () => void;
}) {
  const [imgError, setImgError] = useState(false);
  const storeName = getStoreName(item.sourceUrl);
  const logo = getStoreLogo(storeName);
  return (
    <Pressable
      style={styles.card}
      onPress={onPress}
    >
      {/* Image area with bottom border */}
      <View style={styles.cardImageWrap}>
        {imgError ? (
          <View style={styles.cardPlaceholder}>
            <ActivityIndicator size="small" color={COLORS.primaryContainer} />
            <Text style={styles.cardPlaceholderText}>uploading...</Text>
          </View>
        ) : (
          <Image
            source={{ uri: item.imageUri }}
            style={styles.cardImage}
            cachePolicy="disk"
            onError={() => setImgError(true)}
          />
        )}
        {/* Delete icon */}
        <Pressable
          style={styles.cardDeleteBtn}
          onPress={onDelete}
          hitSlop={8}
        >
          <FontAwesome name="times" size={12} color={COLORS.onSurface} />
        </Pressable>
      </View>
      {/* Store logo below image */}
      <View style={styles.cardTextArea}>
        {logo ? (
          <Image source={logo} style={styles.cardLogoImage} contentFit="contain" />
        ) : (
          <Text style={styles.cardStoreName} numberOfLines={1}>{storeName}</Text>
        )}
      </View>
    </Pressable>
  );
});

export default function SavedScreen() {
  const insets = useSafeAreaInsets();
  const posthog = usePostHog();
  const savedTryOns = useAppStore((s) => s.savedTryOns);
  const { setSavedTryOns, setCurrentUrl } = useAppStore.getState();
  const router = useRouter();
  const [selectedItem, setSelectedItem] = useState<SavedTryOn | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [playingVideoUrl, setPlayingVideoUrl] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const videoPlayer = useVideoPlayer(playingVideoUrl, (player) => {
    player.loop = true;
    player.muted = false;
    player.play();
  });

  const historyLoaded = useAppStore((s) => s.historyLoaded);
  const hasFetched = useRef(false);
  useFocusEffect(
    useCallback(() => {
      posthog?.capture(ANALYTICS_EVENTS.SAVED_TAB_OPENED);
      if (!hasFetched.current) {
        hasFetched.current = true;
        if (!historyLoaded) loadSaved();
      }
    }, [historyLoaded])
  );

  const loadSaved = async () => {
    try {
      const { items } = await api.getHistory();
      setSavedTryOns(items.map(mapHistoryItem));
    } catch (err) {
      // silent
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadSaved();
    setRefreshing(false);
  }, []);

  const handleDeleteAll = () => {
    Alert.alert('delete all', 'delete all saved try-ons? this cannot be undone.', [
      { text: 'cancel', style: 'cancel' },
      {
        text: 'delete all',
        style: 'destructive',
        onPress: async () => {
          setDeleting(true);
          try {
            await api.deleteAllSessions();
            setSavedTryOns([]);
          } catch (err) {
            Alert.alert('error', 'failed to delete all try-ons.');
          } finally {
            setDeleting(false);
          }
        },
      },
    ]);
  };

  const handleDelete = (item: SavedTryOn) => {
    Alert.alert('delete try-on', 'are you sure? this will remove it from the cloud.', [
      { text: 'cancel', style: 'cancel' },
      {
        text: 'delete',
        style: 'destructive',
        onPress: async () => {
          posthog?.capture(ANALYTICS_EVENTS.TRYON_DELETED);
          setDeleting(true);
          try {
            await api.deleteSession(item.sessionId || item.id);
            await loadSaved();
            setSelectedItem(null);
          } catch (err) {
            Alert.alert('error', 'failed to delete try-on.');
          } finally {
            setDeleting(false);
          }
        },
      },
    ]);
  };

  const handleDownload = async (imageUri: string) => {
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('permission needed', 'allow photo library access in settings to save images.');
        return;
      }
      const fileUri = (FileSystem.cacheDirectory || '') + 'tryon-' + Date.now() + '.jpg';
      console.log('[Download] from:', imageUri);
      console.log('[Download] to:', fileUri);
      const download = await FileSystem.downloadAsync(imageUri, fileUri);
      console.log('[Download] result:', download.status, download.uri);
      await MediaLibrary.saveToLibraryAsync(download.uri);
      Alert.alert('saved', 'image saved to your photos.');
    } catch (err: any) {
      console.error('[Download] error:', err.message, err);
      Alert.alert('error', err.message || 'failed to save image.');
    }
  };

  const handleVisitStore = (url?: string) => {
    if (url) {
      posthog?.capture(ANALYTICS_EVENTS.VISIT_STORE_TAPPED, {
        store_name: getStoreNameFromUrl(url),
        product_url: url,
      });
      setCurrentUrl(url);
      router.navigate('/stores');
    }
  };

  const sections = groupByTimeline(savedTryOns);

  // Flatten into virtualized list
  type FlatItem = { type: 'header'; title: string } | { type: 'row'; items: SavedTryOn[] };
  const flatData: FlatItem[] = [];
  for (const section of sections) {
    flatData.push({ type: 'header', title: section.title });
    for (let i = 0; i < section.data.length; i += 2) {
      flatData.push({ type: 'row', items: section.data.slice(i, i + 2) });
    }
  }

  // Detail view
  if (selectedItem) {
    return (
      <View style={styles.container}>
        <View style={[styles.detailScreen, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 80 }]}>
          {/* Header */}
          <View style={styles.detailHeader}>
            <Pressable onPress={() => setSelectedItem(null)} hitSlop={12}>
              <Text style={styles.detailBackText}>{'\u2190'} back</Text>
            </Pressable>
            <Pressable onPress={() => handleDelete(selectedItem)} hitSlop={12}>
              <Text style={styles.detailDeleteText}>delete</Text>
            </Pressable>
          </View>

          {/* Image with store logo stamp */}
          <View style={styles.detailImageContainer}>
            <Image
              source={{ uri: selectedItem.imageUri }}
              style={styles.detailImage}
              contentFit="cover"
              cachePolicy="disk"
            />
            {/* Store logo stamp — diagonal */}
            {(() => {
              const name = getStoreName(selectedItem.sourceUrl);
              const logo = getStoreLogo(name);
              return (
                <View style={styles.detailStoreStamp}>
                  {logo ? (
                    <Image source={logo} style={styles.detailStampLogo} contentFit="contain" />
                  ) : (
                    <Text style={styles.detailStoreStampText}>{name}</Text>
                  )}
                </View>
              );
            })()}
          </View>

          {/* Actions */}
          <View style={styles.detailActions}>
            {selectedItem.sourceUrl && (
              <Pressable
                style={({ pressed }) => [styles.detailBtn, pressed && styles.detailBtnPressed]}
                onPress={() => handleVisitStore(selectedItem.sourceUrl)}
              >
                <Text style={styles.detailBtnText}>visit store</Text>
              </Pressable>
            )}
            <Pressable
              style={({ pressed }) => [styles.detailBtnSecondary, pressed && styles.detailBtnPressed]}
              onPress={() => handleDownload(selectedItem.imageUri)}
            >
              <MaterialIcons name="download" size={20} color={COLORS.onSurface} />
            </Pressable>
            {selectedItem.videoUrl && (
              <Pressable
                style={({ pressed }) => [styles.detailBtnSecondary, pressed && styles.detailBtnPressed]}
                onPress={() => setPlayingVideoUrl(selectedItem.videoUrl!)}
              >
                <Text style={styles.detailBtnSecondaryText}>watch video</Text>
              </Pressable>
            )}
          </View>
        </View>
        <VideoModal
          visible={playingVideoUrl !== null}
          player={videoPlayer}
          onClose={() => setPlayingVideoUrl(null)}
        />
      </View>
    );
  }

  // Grid view
  return (
    <View style={styles.container}>
      <FlatList
        data={flatData}
        keyExtractor={(item) => item.type === 'header' ? `h_${item.title}` : `r_${item.items.map(i => i.id).join('_')}`}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.primaryContainer}
          />
        }
        contentContainerStyle={[
          styles.listContent,
          { paddingTop: insets.top + 48, paddingBottom: insets.bottom + 100 },
        ]}
        ListHeaderComponent={
          <View style={styles.headerBlock}>
            <View style={styles.headerRow}>
              <View>
                <Text style={styles.headline}>
                  your virtual{'\n'}<Text style={styles.headlineAccent}>closet.</Text>
                </Text>
                <Text style={styles.subtitle}>
                  {savedTryOns.length} saved try-on{savedTryOns.length !== 1 ? 's' : ''}
                </Text>
              </View>
              {savedTryOns.length > 0 && (
                <Pressable
                  onPress={handleDeleteAll}
                  disabled={deleting}
                  style={styles.deleteAllBtn}
                >
                  <Text style={styles.deleteAllText}>delete all</Text>
                </Pressable>
              )}
            </View>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <View style={styles.emptyBox}>
              <FontAwesome name="plus" size={24} color={COLORS.outlineVariant} />
            </View>
            <Text style={styles.emptyTitle}>no saved try-ons yet</Text>
            <Text style={styles.emptyText}>
              browse stores and try on clothes.{'\n'}they'll show up here.
            </Text>
          </View>
        }
        renderItem={({ item: flatItem }) => {
          if (flatItem.type === 'header') {
            return <Text style={styles.sectionTitle}>{flatItem.title}</Text>;
          }
          return (
            <View style={styles.gridRow}>
              {flatItem.items.map((item, i) => (
                <View key={item.id} style={i === 1 ? styles.cardRightOffset : undefined}>
                  <TryOnCard
                    item={item}
                    onPress={() => setSelectedItem(item)}
                    onDelete={() => handleDelete(item)}
                  />
                </View>
              ))}
            </View>
          );
        }}
      />

      {deleting && (
        <View style={styles.deletingOverlay}>
          <ActivityIndicator size="large" color={COLORS.primaryContainer} />
          <Text style={styles.deletingText}>deleting...</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  listContent: {
    paddingHorizontal: SPACING.xl,
  },

  // Header
  headerBlock: {
    marginBottom: SPACING.xl,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
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
    fontSize: 14,
    color: COLORS.onSurfaceVariant,
    marginTop: SPACING.sm,
  },
  deleteAllBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1.5,
    borderColor: COLORS.onSurface,
    backgroundColor: COLORS.surfaceContainer,
    marginTop: 8,
  },
  deleteAllText: {
    fontFamily: FONTS.bodySemiBold,
    color: COLORS.error,
    fontSize: 13,
    textTransform: 'lowercase',
  },

  // Section titles
  sectionTitle: {
    fontFamily: FONTS.headline,
    fontSize: 13,
    color: COLORS.onSurfaceVariant,
    letterSpacing: 0.5,
    textTransform: 'lowercase',
    marginBottom: SPACING.sm,
    marginTop: SPACING.lg,
  },

  // Grid
  gridRow: {
    flexDirection: 'row',
    gap: GRID_GAP,
    marginBottom: GRID_GAP,
    alignItems: 'flex-start',
  },
  cardRightOffset: {
    marginTop: 28,
  },

  // Card — Stitch zine style: white card, padded, image with border-bottom, text below
  card: {
    width: CARD_WIDTH,
    backgroundColor: COLORS.surfaceContainerLowest,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: BORDERS.medium,
    borderColor: COLORS.onSurface,
    padding: SPACING.sm,
    ...SHADOWS.hardSmall,
    ...Platform.select({ android: { elevation: 4 } }),
  },
  cardImageWrap: {
    width: '100%',
    aspectRatio: 3 / 4,
    borderBottomWidth: BORDERS.medium,
    borderBottomColor: COLORS.onSurface,
    marginBottom: SPACING.md,
    overflow: 'hidden',
    position: 'relative',
  },
  cardImage: {
    width: '100%',
    height: '100%',
  },
  cardPlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surfaceContainer,
    gap: 8,
  },
  cardPlaceholderText: {
    fontFamily: FONTS.body,
    color: COLORS.onSurfaceVariant,
    fontSize: 11,
    textTransform: 'lowercase',
  },
  cardTextArea: {
    paddingHorizontal: SPACING.xs,
    paddingBottom: SPACING.sm,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  cardLogoImage: {
    width: 56,
    height: 20,
  },
  cardStoreName: {
    fontFamily: FONTS.headline,
    fontSize: 16,
    color: COLORS.onSurface,
    textTransform: 'lowercase',
    lineHeight: 18,
    flex: 1,
  },
  cardVideoIcon: {
    fontSize: 12,
    marginTop: 4,
  },
  cardDeleteBtn: {
    position: 'absolute',
    top: SPACING.sm,
    right: SPACING.sm,
    width: 28,
    height: 28,
    backgroundColor: COLORS.surfaceContainerLowest,
    borderWidth: BORDERS.medium,
    borderColor: COLORS.onSurface,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },

  // Empty state
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
  },
  emptyBox: {
    width: 64,
    height: 64,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: BORDERS.thick,
    borderColor: COLORS.onSurface,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.xl,
  },
  emptyTitle: {
    fontFamily: FONTS.headline,
    fontSize: 20,
    color: COLORS.onSurface,
    marginBottom: SPACING.sm,
    textTransform: 'lowercase',
  },
  emptyText: {
    fontFamily: FONTS.body,
    fontSize: 14,
    color: COLORS.onSurfaceVariant,
    textAlign: 'center',
    lineHeight: 21,
  },

  // Detail view
  detailScreen: {
    flex: 1,
    paddingHorizontal: SPACING.xl,
  },
  detailHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  detailBackText: {
    fontFamily: FONTS.headline,
    fontSize: 15,
    color: COLORS.onSurface,
    textTransform: 'lowercase',
  },
  detailDeleteText: {
    fontFamily: FONTS.headline,
    fontSize: 14,
    color: COLORS.error,
    textTransform: 'lowercase',
  },
  detailImageContainer: {
    width: SCREEN_WIDTH - SPACING.xl * 2,
    height: (SCREEN_WIDTH - SPACING.xl * 2) * 1.33,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: BORDERS.thick,
    borderColor: COLORS.onSurface,
    overflow: 'hidden',
    marginBottom: SPACING.xl,
    ...SHADOWS.hard,
    ...Platform.select({ android: { elevation: 6 } }),
  },
  detailImage: {
    width: '100%',
    height: '100%',
  },
  detailStoreStamp: {
    position: 'absolute',
    top: -14,
    right: -14,
    backgroundColor: COLORS.surfaceContainerLowest,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: BORDERS.medium,
    borderColor: COLORS.onSurface,
    transform: [{ rotate: '8deg' }],
    ...SHADOWS.hardSmall,
    ...Platform.select({ android: { elevation: 4 } }),
  },
  detailStampLogo: {
    width: 80,
    height: 28,
  },
  detailStoreStampText: {
    fontFamily: FONTS.headline,
    fontSize: 14,
    color: COLORS.onSurface,
    textTransform: 'lowercase',
  },
  detailActions: {
    flexDirection: 'row',
    gap: GRID_GAP,
    marginTop: SPACING.xl,
    justifyContent: 'center',
  },
  detailBtn: {
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: BORDERS.thick,
    borderColor: COLORS.onSurface,
    backgroundColor: COLORS.primaryContainer,
    ...SHADOWS.hardSmall,
    ...Platform.select({ android: { elevation: 4 } }),
  },
  detailBtnPressed: {
    transform: [{ translateX: 4 }, { translateY: 4 }],
    ...SHADOWS.none,
  },
  detailBtnText: {
    fontFamily: FONTS.headline,
    color: COLORS.onPrimary,
    fontSize: 15,
    textTransform: 'lowercase',
  },
  detailBtnSecondary: {
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: BORDERS.thick,
    borderColor: COLORS.onSurface,
    backgroundColor: COLORS.surfaceContainerLowest,
    ...SHADOWS.hardSmall,
    ...Platform.select({ android: { elevation: 4 } }),
  },
  detailBtnSecondaryText: {
    fontFamily: FONTS.headline,
    color: COLORS.onSurface,
    fontSize: 15,
    textTransform: 'lowercase',
  },

  // Deleting overlay
  deletingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: `${COLORS.background}EB`,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
  },
  deletingText: {
    fontFamily: FONTS.headline,
    color: COLORS.onSurface,
    fontSize: 15,
    marginTop: 14,
    textTransform: 'lowercase',
  },
});
