/** Runtime substitutions are local to this Vite package; Next.js never loads them. */
export const nativeAliases = {
  'next/link': 'src/platform/link.tsx',
  'next/image': 'src/platform/image.tsx',
  'next/navigation': 'src/platform/router.ts',
  '@/lib/repositories': 'src/adapters/repositories.ts',
  '@/lib/auth/client': 'src/adapters/auth.ts',
  '@/lib/push/client': 'src/adapters/push.ts',
  '@/lib/notifications': 'src/adapters/notifications.ts',
  '@/lib/analytics/events': 'src/adapters/analytics.ts',
  '@/lib/medication-enrichment': 'src/adapters/enrichment.ts',
  '@/lib/mood-draft': 'src/adapters/mood-draft.ts',
  '@/lib/indexed-db': 'src/adapters/legacy-storage.ts',
  '@/components/app-version-provider': 'src/adapters/app-version.ts',
};
