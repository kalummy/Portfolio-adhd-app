export const AUTO_CAPTURE_STABILITY_MS = 2_400;
export const AUTO_CAPTURE_FRAME_COUNT = 8;

function abortError() {
  return new DOMException("자동 촬영 대기가 취소됐어요.", "AbortError");
}

function waitForVideoFrame(video: HTMLVideoElement, signal: AbortSignal) {
  if (signal.aborted) return Promise.reject(abortError());
  if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth > 0) {
    return Promise.resolve();
  }

  return new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      video.removeEventListener("loadeddata", handleReady);
      video.removeEventListener("error", handleError);
      signal.removeEventListener("abort", handleAbort);
    };
    const handleReady = () => {
      if (video.videoWidth === 0 || video.videoHeight === 0) return;
      cleanup();
      resolve();
    };
    const handleError = () => {
      cleanup();
      reject(new Error("카메라 프레임을 준비하지 못했어요."));
    };
    const handleAbort = () => {
      cleanup();
      reject(abortError());
    };

    video.addEventListener("loadeddata", handleReady);
    video.addEventListener("error", handleError);
    signal.addEventListener("abort", handleAbort, { once: true });
  });
}

function waitForStabilityWindow(signal: AbortSignal) {
  if (signal.aborted) return Promise.reject(abortError());

  return new Promise<void>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      signal.removeEventListener("abort", handleAbort);
      resolve();
    }, AUTO_CAPTURE_STABILITY_MS);
    const handleAbort = () => {
      window.clearTimeout(timeoutId);
      reject(abortError());
    };

    signal.addEventListener("abort", handleAbort, { once: true });
  });
}

function waitForRenderedFrames(
  video: HTMLVideoElement,
  signal: AbortSignal,
  frameCount = AUTO_CAPTURE_FRAME_COUNT,
) {
  if (signal.aborted) return Promise.reject(abortError());

  return new Promise<void>((resolve, reject) => {
    let renderedFrames = 0;
    let videoFrameId: number | undefined;
    let animationFrameId: number | undefined;

    const cleanup = () => {
      signal.removeEventListener("abort", handleAbort);
      if (videoFrameId !== undefined && "cancelVideoFrameCallback" in video) {
        video.cancelVideoFrameCallback(videoFrameId);
      }
      if (animationFrameId !== undefined) window.cancelAnimationFrame(animationFrameId);
    };
    const finishFrame = () => {
      renderedFrames += 1;
      if (renderedFrames >= frameCount) {
        cleanup();
        resolve();
        return;
      }
      scheduleFrame();
    };
    const scheduleFrame = () => {
      if ("requestVideoFrameCallback" in video) {
        videoFrameId = video.requestVideoFrameCallback(finishFrame);
      } else {
        animationFrameId = window.requestAnimationFrame(finishFrame);
      }
    };
    const handleAbort = () => {
      cleanup();
      reject(abortError());
    };

    signal.addEventListener("abort", handleAbort, { once: true });
    scheduleFrame();
  });
}

export function getOcrCaptureRegion(frameWidth: number, frameHeight: number) {
  const maximumAspectRatio = 4 / 3;
  let width = frameWidth;
  let height = frameHeight;

  if (frameWidth / frameHeight > maximumAspectRatio) {
    width = Math.round(frameHeight * maximumAspectRatio);
  } else if (frameHeight / frameWidth > maximumAspectRatio) {
    height = Math.round(frameWidth * maximumAspectRatio);
  }

  return {
    x: Math.round((frameWidth - width) / 2),
    y: Math.round((frameHeight - height) / 2),
    width,
    height,
  };
}

/**
 * Waits for real video frames plus a focus/exposure stabilization window.
 * Resolving this promise never means that a medication was recognized; OCR
 * candidate parsing and official matching make that decision after capture.
 */
export async function waitForAutoCaptureReadiness(
  video: HTMLVideoElement,
  signal: AbortSignal,
) {
  await waitForVideoFrame(video, signal);
  await waitForRenderedFrames(video, signal);
  await waitForStabilityWindow(signal);
}

export function isAutoCaptureAbort(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}
