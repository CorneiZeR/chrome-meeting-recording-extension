import { expect, test } from '@playwright/test';
import type { UploadJob } from '../../src/shared/recordingTypes';
import {
  closeHarness,
  findMockMeetTabId,
  getRecordingSession,
  launchExtensionHarness,
  openMockMeetPage,
  sendRuntimeMessage,
  startRecording,
  stopRecording,
} from './helpers/extensionHarness';
import { installDriveSimulator } from './helpers/driveSimulator';

async function uploadJobs(controlPage: Parameters<typeof getRecordingSession>[0]): Promise<UploadJob[]> {
  const session = await getRecordingSession(controlPage) as unknown as { uploadJobs?: UploadJob[] };
  return session.uploadJobs ?? [];
}

test.describe('post-upload recording rename (integration)', () => {
  test('renames the Drive folder, media file, upload job, and history title', async ({}, testInfo) => {
    const harness = await launchExtensionHarness(testInfo.outputPath.bind(testInfo));
    try {
      const drive = await installDriveSimulator(harness.context, 'fast');
      await openMockMeetPage(harness.context);
      const meetTabId = await findMockMeetTabId(harness.controlPage);
      await startRecording(harness.controlPage, meetTabId, {
        storageMode: 'drive',
        micMode: 'off',
        recordSelfVideo: false,
      });
      await harness.controlPage.waitForTimeout(1_500);
      await stopRecording(harness.controlPage);

      await expect.poll(async () => {
        const jobs = await uploadJobs(harness.controlPage);
        return jobs.find((job) => job.status === 'completed')?.namingStatus;
      }, { timeout: 45_000 }).toBe('pending');

      const pending = (await uploadJobs(harness.controlPage)).find((job) => job.namingStatus === 'pending');
      expect(pending?.historyId).toBeTruthy();
      expect(pending?.driveFolderId).toBeTruthy();
      expect(pending?.files).toHaveLength(1);
      expect(pending?.files[0].driveFileId).toBeTruthy();

      const popup = await harness.context.newPage();
      await popup.goto(`chrome-extension://${harness.extensionId}/popup.html`, {
        waitUntil: 'domcontentloaded',
      });
      const input = popup.getByLabel('Recording name');
      await expect(input).toBeVisible();
      await expect(input).toHaveValue(pending!.label);
      await input.fill('Café – Product Review');
      await popup.locator('[data-recording-name-save]').click();
      await expect(input).toBeHidden();

      await expect.poll(async () => {
        const jobs = await uploadJobs(harness.controlPage);
        return jobs.find((job) => job.id === pending!.id)?.namingStatus;
      }, { timeout: 15_000 }).toBe('named');

      const namedJob = (await uploadJobs(harness.controlPage)).find((job) => job.id === pending!.id)!;
      expect(namedJob.label).toBe('Café – Product Review');
      expect(namedJob.driveFolderName).toBe('cafe-product-review');
      expect(namedJob.files[0].filename).toBe('cafe-product-review-recording.webm');

      const history = await sendRuntimeMessage<{
        ok: boolean;
        entries: Array<{
          id: string;
          name: string;
          userNamed?: boolean;
          driveFolderName?: string;
          files: Array<{ filename: string }>;
        }>;
      }>(harness.controlPage, { type: 'LIST_RECORDING_HISTORY' });
      const entry = history.entries.find((candidate) => candidate.id === pending!.historyId)!;
      expect(entry.name).toBe('Café – Product Review');
      expect(entry.userNamed).toBe(true);
      expect(entry.driveFolderName).toBe('cafe-product-review');
      expect(entry.files[0].filename).toBe('cafe-product-review-recording.webm');

      expect(drive.resources[pending!.driveFolderId!]).toBe('cafe-product-review');
      expect(drive.resources[pending!.files[0].driveFileId!]).toBe('cafe-product-review-recording.webm');
      expect(drive.metadataReads).toBeGreaterThanOrEqual(2);
      expect(drive.metadataUpdates).toBe(2);
      await popup.close();
    } finally {
      await closeHarness(harness);
    }
  });
});
