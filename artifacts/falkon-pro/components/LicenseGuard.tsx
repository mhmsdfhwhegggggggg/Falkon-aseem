import React, { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { trpc } from '@/lib/trpc';
import { router, usePathname } from 'expo-router';

export function LicenseGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const firstSegment = pathname.split('/').filter(Boolean)[0] || '';
  const licenseCheckEnabled = process.env.EXPO_PUBLIC_ENABLE_LICENSE_CHECK !== 'false';

  const { data: licenseStatus, isLoading } = trpc.license.validate.useQuery({ hwid: 'device' }, {
    enabled: firstSegment !== 'license-activation' && firstSegment !== 'oauth' && licenseCheckEnabled,
    retry: false,
  } as any);

  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = firstSegment === 'oauth';
    const inActivationScreen = firstSegment === 'license-activation';

    if (!isLoading && !inAuthGroup && !inActivationScreen) {
      if (!licenseCheckEnabled) return;

      const activeLicense = (licenseStatus as any)?.licenses?.find((l: any) => l.status === 'active');

      if (!activeLicense && (licenseStatus as any)?.success !== false) {
        router.replace('/license-activation' as any);
      }
    }
  }, [licenseStatus, isLoading, firstSegment, licenseCheckEnabled]);

  if (isLoading && firstSegment !== 'license-activation' && firstSegment !== 'oauth') {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#030712' }}>
        <ActivityIndicator size="large" color="#8B5CF6" />
      </View>
    );
  }

  return <>{children}</>;
}
