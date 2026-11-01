import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.simonchichi.app',
  appName: '시몬치치',
  webDir: 'dist-android',
  android: {
    backgroundColor: '#fbfdff',
    allowMixedContent: false,
  },
};

export default config;
