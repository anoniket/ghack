import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Image,
  TouchableOpacity,
  Alert,
  Dimensions,
  RefreshControl,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useAppStore, SavedTryOn } from '@/services/store';
import * as api from '@/services/api';

const { width: W, height: H } = Dimensions.get('window');
const CARD_WIDTH = (W - 48) / 2;

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

export default function SavedScreen() {
  const { savedTryOns, setSavedTryOns, setCurrentUrl, setMode } = useAppStore();
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

  useEffect(() => {
    loadSaved();
  }, []);

  const loadSaved = async () => {
    try {
      const { items } = await api.getHistory();
      setSavedTryOns(items.map((item) => ({
        id: item.sessionId,
        imageUri: item.tryonImageUrl,
        sourceUrl: item.sourceUrl,
        timestamp: new Date(item.createdAt).getTime(),
        videoUrl: item.videoUrl,
        sessionId: item.sessionId,
      })));
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

  const renderItem = ({ item }: { item: SavedTryOn }) => (
    <TouchableOpacity
      style={styles.card}
      onPress={() => setSelectedItem(item)}
      activeOpacity={0.85}
    >
      <Image source={{ uri: item.imageUri }} style={styles.cardImage} />
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
                style={styles.detailImage}
                resizeMode="contain"
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
          <Modal
            visible={playingVideoUrl !== null}
            transparent
            animationType="fade"
            onRequestClose={() => setPlayingVideoUrl(null)}
          >
            <View style={styles.videoOverlay}>
              <View style={styles.videoModal}>
                <View style={styles.videoHeader}>
                  <Text style={styles.videoTitle}>Try-On Video</Text>
                  <TouchableOpacity
                    onPress={() => setPlayingVideoUrl(null)}
                    style={styles.videoCloseBtn}
                  >
                    <Text style={styles.videoCloseBtnText}>{'\u2715'}</Text>
                  </TouchableOpacity>
                </View>
                {playingVideoUrl && (
                  <VideoView
                    player={videoPlayer}
                    style={styles.videoPlayer}
                    contentFit="contain"
                    nativeControls
                    allowsFullscreen
                  />
                )}
              </View>
            </View>
          </Modal>
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
              <TouchableOpacity onPress={handleDeleteAll} style={styles.deleteAllBtn} disabled={deleting}>
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
            data={sections}
            keyExtractor={(section) => section.title}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor="#E8C8A0"
              />
            }
            contentContainerStyle={styles.sectionList}
            renderItem={({ item: section }) => (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>{section.title}</Text>
                <View style={styles.gridRow}>
                  {section.data.map((item) => (
                    <View key={item.id}>
                      {renderItem({ item })}
                    </View>
                  ))}
                </View>
              </View>
            )}
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
    letterSpacing: -0.5,
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
    width: CARD_WIDTH,
    height: CARD_WIDTH * 1.4,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#1A1A1A',
  },
  cardImage: {
    width: '100%',
    height: '100%',
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
    width: W - 72,
    height: (W - 72) * 1.33,
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
  videoOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoModal: {
    width: W * 0.9,
    height: H * 0.7,
    backgroundColor: '#141414',
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  videoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  videoTitle: {
    color: '#F5F5F5',
    fontSize: 17,
    fontWeight: '700',
  },
  videoCloseBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#1A1A1A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoCloseBtnText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 15,
  },
  videoPlayer: {
    flex: 1,
    backgroundColor: '#0D0D0D',
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
