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
 *  (expo-av).
 * ============================================================
 */

import React from 'react';
import {
  View,
  Image,
  Modal,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Video, ResizeMode } from 'expo-av';

const { width, height } = Dimensions.get('window');

export default function MediaViewerModal({ item, onClose }) {
  return (
    <Modal visible={!!item} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
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
