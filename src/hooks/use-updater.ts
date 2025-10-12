import { useState, useEffect, useCallback } from 'react';
import { check, type Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { logger } from '../lib/logger';

export interface UpdateStatus {
  checking: boolean;
  available: boolean;
  downloading: boolean;
  readyToInstall: boolean;
  error: string | null;
  currentVersion: string;
  latestVersion: string | null;
  updateInfo: Update | null;
}

export function useUpdater() {
  const [status, setStatus] = useState<UpdateStatus>({
    checking: false,
    available: false,
    downloading: false,
    readyToInstall: false,
    error: null,
    currentVersion: '0.1.0', // Will be updated from package.json
    latestVersion: null,
    updateInfo: null,
  });

  // Check for updates
  const checkForUpdates = useCallback(async (silent = false) => {
    try {
      setStatus((prev) => ({ ...prev, checking: true, error: null }));

      if (!silent) {
        logger.info('Checking for updates...');
      }

      const update = await check();

      if (update) {
        logger.info(`Update available: ${update.version}`);
        setStatus((prev) => ({
          ...prev,
          checking: false,
          available: true,
          latestVersion: update.version,
          updateInfo: update,
        }));
        return update;
      } else {
        if (!silent) {
          logger.info('No updates available');
        }
        setStatus((prev) => ({
          ...prev,
          checking: false,
          available: false,
        }));
        return null;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to check for updates';
      logger.logError(error, 'Update check failed');
      setStatus((prev) => ({
        ...prev,
        checking: false,
        error: errorMessage,
      }));
      return null;
    }
  }, []);

  // Download and install update
  const downloadAndInstall = useCallback(async () => {
    if (!status.updateInfo) {
      logger.error('No update available to install');
      return false;
    }

    try {
      setStatus((prev) => ({ ...prev, downloading: true, error: null }));
      logger.info('Downloading update...');

      // Download and install the update
      await status.updateInfo.downloadAndInstall((event) => {
        switch (event.event) {
          case 'Started':
            logger.info(`Download started: ${event.data.contentLength} bytes`);
            break;
          case 'Progress':
            logger.debug(`Download progress: ${event.data.chunkLength} bytes`);
            break;
          case 'Finished':
            logger.info('Download finished');
            break;
        }
      });

      setStatus((prev) => ({
        ...prev,
        downloading: false,
        readyToInstall: true,
      }));

      logger.info('Update downloaded and ready to install');
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to download update';
      logger.logError(error, 'Update download failed');
      setStatus((prev) => ({
        ...prev,
        downloading: false,
        error: errorMessage,
      }));
      return false;
    }
  }, [status.updateInfo]);

  // Install and restart
  const installAndRestart = useCallback(async () => {
    try {
      logger.info('Restarting application to install update...');
      await relaunch();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to restart application';
      logger.logError(error, 'Restart failed');
      setStatus((prev) => ({
        ...prev,
        error: errorMessage,
      }));
    }
  }, []);

  // Combined function to download, install, and restart
  const updateAndRestart = useCallback(async () => {
    const success = await downloadAndInstall();
    if (success) {
      await installAndRestart();
    }
  }, [downloadAndInstall, installAndRestart]);

  // Auto-check on mount (silent check)
  useEffect(() => {
    const autoCheck = async () => {
      // Wait 5 seconds after app start before checking
      await new Promise((resolve) => setTimeout(resolve, 5000));
      await checkForUpdates(true);
    };

    autoCheck();
  }, [checkForUpdates]);

  return {
    status,
    checkForUpdates,
    downloadAndInstall,
    installAndRestart,
    updateAndRestart,
  };
}
