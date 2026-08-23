"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FlowHeader } from "@/components/flow-ui";
import { MobileShell } from "@/components/mobile-shell";
import {
  getOcrCaptureRegion,
  isAutoCaptureAbort,
  waitForAutoCaptureReadiness,
} from "@/lib/photo-auto-capture";
import {
  createPhotoQaDiagnostics,
  savePhotoQaDiagnostics,
} from "@/lib/photo-qa-diagnostics";
import { recognizePrescriptionPhoto } from "@/lib/photo-recognition";
import {
  clearPendingCandidates,
  dateContextHref,
  registrationHref,
  setManualReturnHref,
  setPendingCandidates,
} from "@/lib/registration-session";

const PHOTO_RETRY_KEY = "addi-photo-capture-retry";

type CameraPhase = "permission" | "requesting" | "capture";
type CameraIssue = "permission-denied" | "camera-unavailable" | "camera-start-failed";

function classifyCameraIssue(error: unknown): CameraIssue {
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError" || error.name === "SecurityError") {
      return "permission-denied";
    }
    if (error.name === "NotFoundError" || error.name === "OverconstrainedError") {
      return "camera-unavailable";
    }
  }
  return "camera-start-failed";
}

export default function MedicationPhotoPage() {
  const router = useRouter();
  const [methodHref, setMethodHref] = useState("/medications/new");
  const [phase, setPhase] = useState<CameraPhase>("permission");
  const [showFailure, setShowFailure] = useState(false);
  const [recognizing, setRecognizing] = useState(false);
  const [cameraIssue, setCameraIssue] = useState<CameraIssue | null>(null);
  const [previewReadyCycle, setPreviewReadyCycle] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("origin") === "medications") {
      setMethodHref(registrationHref("/medications/new"));
    } else {
      setMethodHref(dateContextHref("/medications/new"));
    }
  }, []);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const showRecognitionFailure = useCallback(() => {
    stopCamera();
    setRecognizing(false);
    setPhase("capture");
    setShowFailure(true);
  }, [stopCamera]);

  const finishCapture = useCallback(async (photo: Blob) => {
    try {
      const result = await recognizePrescriptionPhoto(photo, savePhotoQaDiagnostics);
      const hasRecognizedMedication = result.ok
        && result.diagnostics.candidateCount > 0
        && result.diagnostics.officialMatchCount > 0
        && result.medications.length > 0;
      if (!hasRecognizedMedication) {
        showRecognitionFailure();
        return;
      }

      setPendingCandidates(result.medications, "photo");
      stopCamera();
      router.push(registrationHref("/medications/new/photo/result"));
    } catch {
      showRecognitionFailure();
    }
  }, [router, showRecognitionFailure, stopCamera]);

  const requestCamera = useCallback(async () => {
    setShowFailure(false);
    setRecognizing(false);
    setCameraIssue(null);
    setPhase("requesting");

    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setCameraIssue("camera-unavailable");
      setPhase("permission");
      return;
    }

    try {
      stopCamera();
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1_920 },
          height: { ideal: 1_080 },
        },
      });
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack && typeof videoTrack.getCapabilities === "function") {
        const capabilities = videoTrack.getCapabilities() as MediaTrackCapabilities & {
          focusMode?: string[];
        };
        if (capabilities.focusMode?.includes("continuous")) {
          await videoTrack.applyConstraints({
            advanced: [
              { focusMode: "continuous" } as MediaTrackConstraintSet & { focusMode: string },
            ],
          }).catch(() => undefined);
        }
      }
      streamRef.current = stream;
      setPhase("capture");
    } catch (error) {
      stopCamera();
      setCameraIssue(classifyCameraIssue(error));
      setPhase("permission");
    }
  }, [stopCamera]);

  const captureFrame = useCallback(() => {
    if (recognizing || showFailure) return;

    const video = videoRef.current;
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
      savePhotoQaDiagnostics(createPhotoQaDiagnostics({ failureStage: "camera-capture" }));
      showRecognitionFailure();
      return;
    }

    const canvas = document.createElement("canvas");
    const captureRegion = getOcrCaptureRegion(video.videoWidth, video.videoHeight);
    canvas.width = captureRegion.width;
    canvas.height = captureRegion.height;
    const context = canvas.getContext("2d");
    if (!context) {
      savePhotoQaDiagnostics(createPhotoQaDiagnostics({ failureStage: "camera-capture" }));
      showRecognitionFailure();
      return;
    }

    const captureDiagnostics = createPhotoQaDiagnostics({ cameraCaptureSucceeded: true });
    savePhotoQaDiagnostics(captureDiagnostics);
    setRecognizing(true);
    context.drawImage(
      video,
      captureRegion.x,
      captureRegion.y,
      captureRegion.width,
      captureRegion.height,
      0,
      0,
      canvas.width,
      canvas.height,
    );
    stopCamera();
    canvas.toBlob(
      (blob) => {
        if (blob) {
          savePhotoQaDiagnostics({ ...captureDiagnostics, jpegCreated: true });
          void finishCapture(blob);
          return;
        }
        savePhotoQaDiagnostics({ ...captureDiagnostics, failureStage: "jpeg" });
        showRecognitionFailure();
      },
      "image/jpeg",
      0.95,
    );
  }, [finishCapture, recognizing, showFailure, showRecognitionFailure, stopCamera]);

  useEffect(() => {
    if (window.sessionStorage.getItem(PHOTO_RETRY_KEY) !== "1") return;
    window.sessionStorage.removeItem(PHOTO_RETRY_KEY);
    void requestCamera();
  }, [requestCamera]);

  useEffect(() => {
    if (phase !== "capture" || !videoRef.current || !streamRef.current) return;
    const video = videoRef.current;
    let cancelled = false;
    video.srcObject = streamRef.current;
    void video.play()
      .then(() => {
        if (!cancelled) setPreviewReadyCycle((cycle) => cycle + 1);
      })
      .catch((error) => {
        if (cancelled) return;
        stopCamera();
        setCameraIssue(classifyCameraIssue(error));
        setPhase("permission");
      });
    return () => {
      cancelled = true;
    };
  }, [phase, stopCamera]);

  useEffect(() => {
    if (
      phase !== "capture" ||
      previewReadyCycle === 0 ||
      recognizing ||
      showFailure ||
      !videoRef.current ||
      !streamRef.current
    ) return;

    const controller = new AbortController();
    void waitForAutoCaptureReadiness(videoRef.current, controller.signal)
      .then(captureFrame)
      .catch((error) => {
        if (!isAutoCaptureAbort(error)) showRecognitionFailure();
      });
    return () => controller.abort();
  }, [captureFrame, phase, previewReadyCycle, recognizing, showFailure, showRecognitionFailure]);

  useEffect(() => stopCamera, [stopCamera]);

  function retryCapture() {
    void requestCamera();
  }

  function useManualInput() {
    stopCamera();
    clearPendingCandidates();
    setManualReturnHref(registrationHref("/medications/new/photo"));
    router.push(registrationHref("/medications/new/manual/name"));
  }

  return (
    <MobileShell className="photo-screen" data-camera-issue={cameraIssue ?? undefined}>
      <FlowHeader
        title="사진 촬영"
        fallbackHref={methodHref}
        beforeBack={stopCamera}
      />
      <section className="camera-stage">
        {phase === "capture" ? (
          <div className="camera-preview camera-preview-live" aria-hidden="true">
            <video ref={videoRef} autoPlay muted playsInline />
          </div>
        ) : (
          <div className="camera-preview" aria-hidden="true" />
        )}

        <div className={`camera-copy ${phase === "capture" ? "capture" : "permission"}`}>
          {phase === "capture" ? (
            <strong>테두리에 맞춰<br />약 이름이 적힌 봉투나 처방전을 촬영하세요</strong>
          ) : (
            <>
              <strong>카메라 기능을 허용해주세요</strong>
              <button type="button" onClick={() => void requestCamera()} disabled={phase === "requesting"}>
                허용하기
              </button>
            </>
          )}
        </div>

        {recognizing ? (
          <div className="recognition-loading-layer" role="status" aria-label="약 정보 인식 중">
            <Image
              className="recognition-spinner"
              src="/icons/recognition-spinner.svg"
              alt=""
              width={40}
              height={40}
            />
          </div>
        ) : null}
      </section>

      {showFailure ? (
        <div className="recognition-alert-layer" role="presentation">
          <section className="recognition-alert" role="alertdialog" aria-modal="true" aria-labelledby="recognition-alert-title">
            <header>
              <h2 id="recognition-alert-title">다시 촬영해주세요</h2>
            </header>
            <p>약 정보를 읽을 수 없어요.<br />다시 촬영하거나 직접 입력해주세요</p>
            <div className="recognition-alert-actions">
              <button type="button" className="manual" onClick={useManualInput}>직접 입력</button>
              <button type="button" className="retry" onClick={retryCapture}>다시 촬영</button>
            </div>
          </section>
        </div>
      ) : null}
    </MobileShell>
  );
}
