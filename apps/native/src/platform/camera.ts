import { registerPlugin } from '@capacitor/core';
const permission = registerPlugin<{ ensure(): Promise<{ granted: boolean }> }>('AddiCameraPermission');
export async function nativeGetUserMedia(constraints: MediaStreamConstraints) {
  if (!(await permission.ensure()).granted) throw new DOMException('Camera permission denied', 'NotAllowedError');
  return navigator.mediaDevices.getUserMedia(constraints);
}
