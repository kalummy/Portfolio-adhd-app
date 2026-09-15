import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.addi.app.dev',
  appName: 'ADDI Dev',
  webDir: 'dist',
  loggingBehavior: 'none',
  android: { backgroundColor: '#fafafb' },
  plugins: {
    SplashScreen: { launchAutoHide: false, launchFadeOutDuration: 200, backgroundColor: '#fafafb', showSpinner: false },
    SystemBars: { insetsHandling: 'css', style: 'LIGHT', hidden: false, initialViewportFitValueHint: 'cover' },
  },
};
export default config;
