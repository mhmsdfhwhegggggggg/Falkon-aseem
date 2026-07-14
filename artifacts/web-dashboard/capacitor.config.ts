import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.falkon.aseem',
  appName: 'Falkon Aseem',
  webDir: 'dist/public',
  android: {
    // Required while the production API is served over plain HTTP.
    // Cleartext traffic is restricted to the configured API host by Android's
    // network_security_config.xml rather than enabled for every destination.
    allowMixedContent: true,
    backgroundColor: '#ffffff',
  },
};

export default config;
