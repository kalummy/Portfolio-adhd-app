import type { CapacitorConfig } from '@capacitor/cli';
import environments from './native-environments.json';

const stage = process.env.ADDI_NATIVE_STAGE;
if (stage !== 'development' && stage !== 'production') throw new Error('ADDI_NATIVE_STAGE required');

const config: CapacitorConfig = {
  appId: environments[stage].package,
  appName: '아디',
  webDir: 'dist',
  loggingBehavior: 'none',
  android: { backgroundColor: '#fafafb' },
  plugins: {
    SplashScreen: { launchAutoHide: false, launchFadeOutDuration: 0, backgroundColor: '#fafafb', showSpinner: false },
    SystemBars: { insetsHandling: 'css', style: 'LIGHT', hidden: false, initialViewportFitValueHint: 'cover' },
  },
};
export default config;
