/**
 * ============================================================
 *  AirSnap — mediaDownload
 * ============================================================
 *  Save a delivered photo/video (remote URL) to the phone's
 *  camera roll.
 *
 *  Two-step: download to the app cache with expo-file-system,
 *  then hand the local file to expo-media-library. The ESRI
 *  photo URLs carry no file extension, so we name the temp
 *  file ourselves (.jpg / .mp4) — MediaLibrary needs it to
 *  detect the asset type.
 *
 *  SDK 54 note: downloadAsync lives in the legacy API
 *  ('expo-file-system/legacy'); the new default export is the
 *  class-based File/Directory API.
 * ============================================================
 */

import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';

/**
 * Download `uri` and save it to the user's photo library.
 * type: 'photo' | 'video'. Throws with a friendly message on
 * permission denial or network failure.
 */
export async function saveMediaToDevice(uri, type) {
  // writeOnly:true → iOS shows the lighter "Add Photos Only" prompt.
  const { status } = await MediaLibrary.requestPermissionsAsync(true);
  if (status !== 'granted') {
    throw new Error('Photos permission is required to save media. You can enable it in Settings.');
  }

  const ext = type === 'video' ? '.mp4' : '.jpg';
  const dest = `${FileSystem.cacheDirectory}airsnap_${Date.now()}${ext}`;

  const { uri: localUri, status: httpStatus } = await FileSystem.downloadAsync(uri, dest);
  if (httpStatus && httpStatus >= 400) {
    throw new Error(`Download failed (HTTP ${httpStatus}).`);
  }

  await MediaLibrary.saveToLibraryAsync(localUri);

  // Best-effort cache cleanup — the asset is already in the library.
  FileSystem.deleteAsync(localUri, { idempotent: true }).catch(() => {});
}
