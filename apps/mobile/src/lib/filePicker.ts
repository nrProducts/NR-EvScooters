import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { chooseAction, notify } from './confirm';
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
    notify('Unsupported file', 'Upload a JPEG, PNG or PDF.');
    return false;
  }
  if (size !== undefined && size > MAX_BYTES) {
    notify('File too large', 'Each document must be 10 MB or smaller.');
    return false;
  }
  return true;
}

async function fromCamera(): Promise<LocalFile | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) {
    notify('Camera unavailable', 'Allow camera access to photograph your document.');
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
    notify('Photos unavailable', 'Allow photo access to pick your document.');
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
 *
 * Web keeps the synchronous window.confirm path on purpose: the eventual
 * ImagePicker/DocumentPicker call must run inside the click's user-activation
 * window, which browsers require to open a file/camera picker at all. Awaiting
 * a themed sheet first would lose that activation. Native has no such rule, so
 * it gets the themed action sheet.
 */
export async function pickDocument(): Promise<LocalFile | null> {
  if (Platform.OS === 'web') {
    const wantsPdf = window.confirm('Upload a PDF file? Press Cancel to upload a photo instead.');
    if (wantsPdf) return fromFiles();
    const wantsCamera = window.confirm('Take a new photo? Press Cancel to choose an existing photo instead.');
    return wantsCamera ? fromCamera() : fromLibrary();
  }

  const choice = await chooseAction({
    title: 'Add document',
    message: 'How would you like to provide this document?',
    options: [
      { key: 'camera', label: 'Take Photo' },
      { key: 'library', label: 'Choose Photo' },
      { key: 'files', label: 'Browse Files (PDF)' },
    ],
  });

  if (choice === 'camera') return fromCamera();
  if (choice === 'library') return fromLibrary();
  if (choice === 'files') return fromFiles();
  return null;
}

/**
 * Camera or gallery only — a profile photo is never a PDF. The caller is
 * expected to show capture guidance (lighting, no sunglasses, plain
 * background) before invoking this, not inside it.
 */
export async function pickPhoto(): Promise<LocalFile | null> {
  if (Platform.OS === 'web') {
    const wantsCamera = window.confirm('Take a new photo? Press Cancel to choose from your files instead.');
    return wantsCamera ? fromCamera() : fromLibrary();
  }

  const choice = await chooseAction({
    title: 'Add photo',
    message: 'How would you like to provide your photo?',
    options: [
      { key: 'camera', label: 'Take Photo' },
      { key: 'library', label: 'Choose from Gallery' },
    ],
  });

  if (choice === 'camera') return fromCamera();
  if (choice === 'library') return fromLibrary();
  return null;
}
