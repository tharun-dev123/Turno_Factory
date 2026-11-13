import { useAudioPlayer } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { useCallback } from 'react';

import { appConfig } from '@/config/appConfig';

// Short sounds bundled with the app (generated locally; no network, no microphone).
const successSound = require('../../assets/sounds/scan-success.wav');
const alertSound = require('../../assets/sounds/scan-alert.wav');

export type ScanFeedbackKind = 'detected' | 'success' | 'warning' | 'error';

/**
 * Vibration and sound for scan events. Everything here is best-effort: a missing sound or haptics engine must
 * never break scanning.
 */
export function useScanFeedback() {
  const successPlayer = useAudioPlayer(successSound);
  const alertPlayer = useAudioPlayer(alertSound);

  return useCallback(
    (kind: ScanFeedbackKind) => {
      try {
        if (kind === 'detected') {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
          return;
        }
        const type =
          kind === 'success'
            ? Haptics.NotificationFeedbackType.Success
            : kind === 'warning'
              ? Haptics.NotificationFeedbackType.Warning
              : Haptics.NotificationFeedbackType.Error;
        Haptics.notificationAsync(type).catch(() => undefined);

        if (!appConfig.scanner.soundEnabled) return;
        const player = kind === 'success' ? successPlayer : alertPlayer;
        Promise.resolve(player.seekTo(0))
          .then(() => player.play())
          .catch(() => undefined);
      } catch {
        // ignore: feedback is optional
      }
    },
    [successPlayer, alertPlayer],
  );
}
