/** Shared by the Web route and bundled Native router. Contains UX messages only. */
const messages = {
  medicationToast: { added: '약을 등록했어요!', deleted: '복용중인 약을 삭제했어요.', 'schedule-updated': '복용 일정을 수정했어요.', 'time-updated': '복용 시간을 수정했어요.' },
  visitToast: { added: '내원일정을 추가했어요.', updated: '내원일정을 수정했어요.', deleted: '내원일정을 삭제했어요.' },
  moodToast: { saved: '감정기록 완료!\n오늘도 고생 많으셨어요 🩷' },
  feedbackToast: { sent: '소중한 의견을 남겨주셔서 감사드려요  🙌' },
} as const;
type ToastQueryKey = keyof typeof messages;
export function homeToastProps(params: { get(key: string): string | null }) {
  for (const key of ['medicationToast', 'moodToast', 'visitToast', 'feedbackToast'] as const) {
    const value = params.get(key);
    if (!value) continue;
    const id = params.get('toastId') ?? undefined;
    const message = (messages[key] as Record<string, string>)[value];
    return { initialToast: key === 'medicationToast' && value === 'added' && !id ? undefined : message,
      initialToastId: id, initialToastQueryKey: key as ToastQueryKey };
  }
  return {};
}
