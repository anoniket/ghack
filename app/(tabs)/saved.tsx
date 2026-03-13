import React, { useState, useCallback, useRef, memo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  useWindowDimensions,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { useVideoPlayer } from 'expo-video';
import VideoModal from '@/components/VideoModal';
import { useAppStore, SavedTryOn } from '@/services/store';
import * as api from '@/services/api';
import { mapHistoryItem } from '@/utils/imageUtils';


interface TimelineSection {
  title: string;
  data: SavedTryOn[];
}

function getStoreName(url?: string): string {
  if (!url) return 'Try-On';
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    const name = host.split('.')[0];
    return name.charAt(0).toUpperCase() + name.slice(1);
  } catch {
    return 'Try-On';
  }
}

function groupByTimeline(items: SavedTryOn[]): TimelineSection[] {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterday = today - 86400000;
  const thisWeek = today - 7 * 86400000;

  const groups: Record<string, SavedTryOn[]> = {
    Today: [],
    Yesterday: [],
    'This Week': [],
    Earlier: [],
  };

  for (const item of items) {
    const ts = item.timestamp;
    if (ts >= today) {
      groups.Today.push(item);
    } else if (ts >= yesterday) {
      groups.Yesterday.push(item);
    } else if (ts >= thisWeek) {
      groups['This Week'].push(item);
    } else {
      groups.Earlier.push(item);
    }
  }

  return Object.entries(groups)
    .filter(([, items]) => items.length > 0)
    .map(([title, data]) => ({ title, data }));
}

// M27: Memoized card — only re-renders when its own props change
const TryOnCard = memo(function TryOnCard({ item, width, height, onPress }: {
  item: SavedTryOn;
  width: number;
  height: number;
  onPress: () => void;
}) {
  const [imgError, setImgError] = useState(false);
  return (
    <TouchableOpacity
      style={[styles.card, { width, height }]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      {imgError ? (
        <View style={styles.cardImagePlaceholder}>
          <ActivityIndicator size="small" color="#E8C8A0" />
          <Text style={styles.placeholderText}>Uploading...</Text>
        </View>
      ) : (
        <Image
          source={{ uri: item.imageUri }}
          style={styles.cardImage}
          cachePolicy="disk"
          onError={() => setImgError(true)}
        />
      )}
      <View style={styles.cardOverlay}>
        <Text style={styles.cardName} numberOfLines={1}>
          {getStoreName(item.sourceUrl)}
        </Text>
        <View style={styles.cardMeta}>
          {item.videoUrl && (
            <Text style={styles.videoIndicator}>🎬</Text>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
});

export default function SavedScreen() {
  const { width: W, height: H } = useWindowDimensions();
  const CARD_WIDTH = (W - 48) / 2;
  // M27: Individual selectors for read state, getState() for setters
  const savedTryOns = useAppStore((s) => s.savedTryOns);
  const { setSavedTryOns, setCurrentUrl, setMode } = useAppStore.getState();
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

  // SS-10/PLAT-13: Skip fetch if index.tsx already loaded history
  const historyLoaded = useAppStore((s) => s.historyLoaded);
  const hasFetched = useRef(false);
  useFocusEffect(
    useCallback(() => {
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
      // silent — non-critical
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadSaved();
    setRefreshing(false);
  }, []);

  const handleDeleteAll = () => {
    Alert.alert('Delete All', 'Delete all saved try-ons? This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete All',
        style: 'destructive',
        onPress: async () => {
          setDeleting(true);
          try {
            await api.deleteAllSessions();
            setSavedTryOns([]);
          } catch (err) {
            Alert.alert('Error', 'Failed to delete all try-ons.');
          } finally {
            setDeleting(false);
          }
        },
      },
    ]);
  };

  const handleDelete = (item: SavedTryOn) => {
    Alert.alert('Delete Try-On', 'Are you sure? This will remove it from the cloud.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setDeleting(true);
          try {
            await api.deleteSession(item.sessionId || item.id);
            await loadSaved();
            setSelectedItem(null);
          } catch (err) {
            Alert.alert('Error', 'Failed to delete try-on.');
          } finally {
            setDeleting(false);
          }
        },
      },
    ]);
  };

  const handleVisitStore = (url?: string) => {
    if (url) {
      setCurrentUrl(url);
      setMode('webview');
      setSelectedItem(null);
      router.navigate('/');
    }
  };

  const sections = groupByTimeline(savedTryOns);
  const CARD_HEIGHT = CARD_WIDTH * 1.4;

  // PERF-12: Flatten sections into a single virtualized list
  // Each item is either a section header or a row of 2 cards
  type FlatItem = { type: 'header'; title: string } | { type: 'row'; items: SavedTryOn[] };
  const flatData: FlatItem[] = [];
  for (const section of sections) {
    flatData.push({ type: 'header', title: section.title });
    for (let i = 0; i < section.data.length; i += 2) {
      flatData.push({ type: 'row', items: section.data.slice(i, i + 2) });
    }
  }

  if (selectedItem) {
    return (
      <View style={styles.container}>
        <SafeAreaView style={{ flex: 1 }}>
          <View style={styles.detailHeader}>
            <TouchableOpacity
              onPress={() => setSelectedItem(null)}
              style={styles.detailBtn}
            >
              <Text style={styles.detailBtnText}>{'\u2190'} Back</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => handleDelete(selectedItem)}
              style={styles.detailBtn}
            >
              <Text style={[styles.detailBtnText, { color: '#ef4444' }]}>
                Delete
              </Text>
            </TouchableOpacity>
          </View>
          <View style={styles.detailContent}>
            <View style={styles.detailBorder}>
              <Image
                source={{ uri: selectedItem.imageUri }}
                style={[styles.detailImage, { width: W - 72, height: (W - 72) * 1.33 }]}
                contentFit="contain"
                cachePolicy="disk"
              />
            </View>
            <Text style={styles.detailName}>{getStoreName(selectedItem.sourceUrl)}</Text>
            <Text style={styles.detailDate}>
              {new Date(selectedItem.timestamp).toLocaleDateString(undefined, {
                weekday: 'short',
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </Text>

            <View style={styles.detailActions}>
              {selectedItem.sourceUrl && (
                <TouchableOpacity
                  style={styles.actionBtn}
                  onPress={() => handleVisitStore(selectedItem.sourceUrl)}
                >
                  <Text style={styles.actionBtnText}>Visit Store</Text>
                </TouchableOpacity>
              )}
              {selectedItem.videoUrl && (
                <TouchableOpacity
                  style={[styles.actionBtn, styles.actionBtnSecondary]}
                  onPress={() => setPlayingVideoUrl(selectedItem.videoUrl!)}
                >
                  <Text style={[styles.actionBtnText, styles.actionBtnSecondaryText]}>
                    Watch Video
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
          <VideoModal
            visible={playingVideoUrl !== null}
            player={videoPlayer}
            onClose={() => setPlayingVideoUrl(null)}
          />
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <SafeAreaView style={{ flex: 1 }}>
        <View style={styles.headerContainer}>
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.headerTitle}>Saved</Text>
              <Text style={styles.headerCount}>{savedTryOns.length} try-ons</Text>
            </View>
            {savedTryOns.length > 0 && (
              <TouchableOpacity onPress={handleDeleteAll} style={styles.deleteAllBtn} disabled={deleting} accessibilityLabel="Delete all try-ons" accessibilityRole="button">
                <Text style={styles.deleteAllText}>Delete All</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {savedTryOns.length === 0 ? (
          <View style={styles.emptyContainer}>
            <View style={styles.emptyCircle}>
              <Text style={styles.emptyIcon}>+</Text>
            </View>
            <Text style={styles.emptyTitle}>No saved try-ons</Text>
            <Text style={styles.emptyText}>
              Browse products and tap "Try On" to see{'\n'}yourself wearing them
            </Text>
          </View>
        ) : (
          <FlatList
            data={flatData}
            keyExtractor={(item) => item.type === 'header' ? `h_${item.title}` : `r_${item.items.map(i => i.id).join('_')}`}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor="#E8C8A0"
              />
            }
            contentContainerStyle={styles.sectionList}
            renderItem={({ item: flatItem }) => {
              if (flatItem.type === 'header') {
                return <Text style={styles.sectionTitle}>{flatItem.title}</Text>;
              }
              return (
                <View style={styles.gridRow}>
                  {flatItem.items.map((item) => (
                    <TryOnCard
                      key={item.id}
                      item={item}
                      width={CARD_WIDTH}
                      height={CARD_HEIGHT}
                      onPress={() => setSelectedItem(item)}
                    />
                  ))}
                </View>
              );
            }}
          />
        )}

        {deleting && (
          <View style={styles.deletingOverlay}>
            <ActivityIndicator size="large" color="#E8C8A0" />
            <Text style={styles.deletingText}>Deleting...</Text>
          </View>
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D0D0D',
  },
  headerContainer: {
    paddingHorizontal: 22,
    paddingTop: 16,
    paddingBottom: 20,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  deleteAllBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: 'rgba(239,68,68,0.15)',
  },
  deleteAllText: {
    color: '#ef4444',
    fontSize: 13,
    fontWeight: '600',
  },
  headerTitle: {
    fontSize: 30,
    fontWeight: '800',
    color: '#F5F5F5',
  },
  headerCount: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.3)',
    marginTop: 4,
  },
  sectionList: {
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.4)',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  gridRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  card: {
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#1A1A1A',
  },
  cardImage: {
    width: '100%',
    height: '100%',
  },
  cardImagePlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1A1A1A',
    gap: 8,
  },
  placeholderText: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 11,
  },
  cardOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 12,
    paddingBottom: 12,
    paddingTop: 30,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  cardName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#F5F5F5',
  },
  cardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  videoIndicator: {
    fontSize: 14,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  emptyCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#1A1A1A',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  emptyIcon: {
    fontSize: 24,
    color: '#E8C8A0',
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#F5F5F5',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.3)',
    textAlign: 'center',
    lineHeight: 21,
  },
  detailHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  detailBtn: {
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  detailBtnText: {
    color: '#E8C8A0',
    fontSize: 15,
    fontWeight: '600',
  },
  detailContent: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  detailBorder: {
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 20,
    borderWidth: 2,
    borderColor: 'rgba(232,200,160,0.2)',
  },
  detailImage: {
    borderRadius: 18,
  },
  detailName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#F5F5F5',
    textAlign: 'center',
  },
  detailDate: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.3)',
    marginTop: 8,
  },
  detailActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  actionBtn: {
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 14,
    backgroundColor: '#E8C8A0',
  },
  actionBtnText: {
    color: '#0D0D0D',
    fontSize: 15,
    fontWeight: '700',
  },
  actionBtnSecondary: {
    backgroundColor: '#1A1A1A',
    borderWidth: 1,
    borderColor: 'rgba(232,200,160,0.3)',
  },
  actionBtnSecondaryText: {
    color: '#E8C8A0',
  },
  deletingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(13,13,13,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
  },
  deletingText: {
    color: '#E8C8A0',
    fontSize: 15,
    fontWeight: '600',
    marginTop: 14,
  },
});
