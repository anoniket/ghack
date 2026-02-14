import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Image,
  TouchableOpacity,
  Alert,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppStore } from '@/services/store';
import { getSavedTryOns, deleteTryOn, SavedTryOn } from '@/utils/imageUtils';

const { width: W } = Dimensions.get('window');
const CARD_WIDTH = (W - 48) / 2;

export default function SavedScreen() {
  const { savedTryOns, setSavedTryOns } = useAppStore();
  const [selectedItem, setSelectedItem] = useState<SavedTryOn | null>(null);

  useEffect(() => {
    loadSaved();
  }, []);

  const loadSaved = async () => {
    const tryOns = await getSavedTryOns();
    setSavedTryOns(tryOns);
  };

  const handleDelete = (item: SavedTryOn) => {
    Alert.alert('Delete Try-On', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteTryOn(item.id);
          await loadSaved();
          setSelectedItem(null);
        },
      },
    ]);
  };

  const renderItem = ({ item }: { item: SavedTryOn }) => (
    <TouchableOpacity
      style={styles.card}
      onPress={() => setSelectedItem(item)}
      activeOpacity={0.85}
    >
      <Image source={{ uri: item.imageUri }} style={styles.cardImage} />
      <View style={styles.cardOverlay}>
        <Text style={styles.cardName} numberOfLines={1}>
          {item.productName}
        </Text>
        {item.productPrice && (
          <Text style={styles.cardPrice}>{item.productPrice}</Text>
        )}
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
            <Text style={styles.detailName}>{selectedItem.productName}</Text>
            {selectedItem.productPrice && (
              <Text style={styles.detailPrice}>{selectedItem.productPrice}</Text>
            )}
            <Text style={styles.detailDate}>
              {new Date(selectedItem.timestamp).toLocaleDateString()}
            </Text>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <SafeAreaView style={{ flex: 1 }}>
        <View style={styles.headerContainer}>
          <Text style={styles.headerTitle}>Saved</Text>
          <Text style={styles.headerCount}>{savedTryOns.length} try-ons</Text>
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
            data={savedTryOns}
            renderItem={renderItem}
            keyExtractor={(item) => item.id}
            numColumns={2}
            contentContainerStyle={styles.grid}
            columnWrapperStyle={styles.row}
          />
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
  grid: {
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
  row: {
    gap: 12,
    marginBottom: 12,
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
  cardPrice: {
    fontSize: 12,
    color: '#E8C8A0',
    fontWeight: '600',
    marginTop: 2,
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
  detailPrice: {
    fontSize: 16,
    color: '#E8C8A0',
    fontWeight: '600',
    marginTop: 4,
  },
  detailDate: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.3)',
    marginTop: 8,
  },
});
