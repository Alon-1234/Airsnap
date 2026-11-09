/**
 * ============================================================
 *  AirSnap — MediaViewerModal
 * ============================================================
 *  Full-screen viewer for a delivered photo or video.
 *
 *  Usage:
 *    const [viewer, setViewer] = useState(null);
 *    setViewer({ uri, type: 'photo' | 'video' });
 *    <MediaViewerModal item={viewer} onClose={() => setViewer(null)} />
 *
 *  Photos render as a contained Image on a dark backdrop;
 *  videos play immediately with native transport controls
 *  (expo-av). The download button (top-left) saves the item
 *  to the phone's photo library.
 * ============================================================
 */

import React, { useState } from 'react';
import {
  View,
  Image,
  Modal,
  Alert,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Video, ResizeMode } from 'expo-av';

import { saveMediaToDevice, SAVE_DESTINATION } from '../utils/mediaDownload';

const { width, height } = Dimensions.get('window');

export default function MediaViewerModal({ item, onClose }) {
  const [saving, setSaving] = useState(false);

  const handleDownload = async () => {
    if (!item || saving) return;
    setSaving(true);
    try {
      await saveMediaToDevice(item.uri, item.type);
      Alert.alert('Saved', `${item.type === 'video' ? 'Video' : 'Photo'} saved to your ${SAVE_DESTINATION}.`);
    } catch (err) {
      Alert.alert('Could not save', err.message || 'Unknown error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={!!item} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <TouchableOpacity
          style={styles.downloadBtn}
          onPress={handleDownload}
          disabled={saving}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Ionicons name="download-outline" size={30} color="#FFFFFF" />
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.closeBtn}
          onPress={onClose}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="close-circle" size={36} color="#FFFFFF" />
        </TouchableOpacity>

        {item?.type === 'video' ? (
          <Video
            source={{ uri: item.uri }}
            style={styles.video}
            useNativeControls
            shouldPlay
            resizeMode={ResizeMode.CONTAIN}
          />
        ) : item ? (
          <Image source={{ uri: item.uri }} style={styles.image} resizeMode="contain" />
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtn: {
    position: 'absolute',
    top: 60,
    right: 20,
    zIndex: 10,
  },
  downloadBtn: {
    position: 'absolute',
    top: 62,
    left: 20,
    zIndex: 10,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    width: width - 40,
    height: width - 40,
    borderRadius: 14,
  },
  video: {
    width: width,
    height: height * 0.7,
  },
});
