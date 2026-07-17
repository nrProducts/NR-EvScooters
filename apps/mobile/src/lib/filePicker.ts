import { Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import type { LocalFile } from '../types/api';

/** Must match the backend's allow-list and the bucket's allowed_mime_types. */
const ALLOWED = ['image/jpeg', 'image/png', 'application/pdf'];
const MAX_BYTES = 10 * 1024 * 1024;

function extensionOf(mime: string): string {
  if (mime === 'image/png') return 'png';
  if (mime === 'application/pdf') return 'pdf';
  return 'jpg';
}

/**
 * The backend re-checks size and sniffs magic numbers regardless — this is
 * purely so the rider finds out before waiting on a doomed upload.
 */
function validate(file: LocalFile, size?: number): boolean {
  if (!ALLOWED.includes(file.mimeType)) {
    Alert.alert('Unsupported file', 'Upload a JPEG, PNG or PDF.');
    return false;
  }
  if (size !== undefined && size > MAX_BYTES) {
    Alert.alert('File too large', 'Each document must be 10 MB or smaller.');
    return false;
  }
  return true;
}

async function fromCamera(): Promise<LocalFile | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) {
    Alert.alert('Camera unavailable', 'Allow camera access to photograph your document.');
    return null;
  }

  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ['images'],
    quality: 0.8,
    allowsEditing: false,
  });
  if (result.canceled || !result.assets[0]) return null;

  const asset = result.assets[0];
  const mimeType = asset.mimeType ?? 'image/jpeg';
  const file: LocalFile = {
    uri: asset.uri,
    name: asset.fileName ?? `document.${extensionOf(mimeType)}`,
    mimeType,
  };
  return validate(file, asset.fileSize) ? file : null;
}

async function fromLibrary(): Promise<LocalFile | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    Alert.alert('Photos unavailable', 'Allow photo access to pick your document.');
    return null;
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 0.8,
  });
  if (result.canceled || !result.assets[0]) return null;

  const asset = result.assets[0];
  const mimeType = asset.mimeType ?? 'image/jpeg';
  const file: LocalFile = {
    uri: asset.uri,
    name: asset.fileName ?? `document.${extensionOf(mimeType)}`,
    mimeType,
  };
  return validate(file, asset.fileSize) ? file : null;
}

async function fromFiles(): Promise<LocalFile | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ALLOWED,
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled || !result.assets[0]) return null;

  const asset = result.assets[0];
  const mimeType = asset.mimeType ?? 'application/pdf';
  const file: LocalFile = { uri: asset.uri, name: asset.name, mimeType };
  return validate(file, asset.size ?? undefined) ? file : null;
}

/**
 * Offers camera / photos / files and resolves with the chosen file, or null
 * if the rider backed out.
 */
export function pickDocument(): Promise<LocalFile | null> {
  return new Promise((resolve) => {
    Alert.alert('Add document', 'How would you like to provide this document?', [
      { text: 'Take Photo', onPress: () => void fromCamera().then(resolve) },
      { text: 'Choose Photo', onPress: () => void fromLibrary().then(resolve) },
      { text: 'Browse Files (PDF)', onPress: () => void fromFiles().then(resolve) },
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
    ]);
  });
}
