import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.dalelogo.mapper',
  appName: 'Mapper',
  webDir: 'www',
  server: {
    androidScheme: 'https',
  },
};

export default config;
