'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Center, Loader } from '@mantine/core';

export default function IndexPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/calendar/');
  }, [router]);
  return (
    <Center h="100vh">
      <Loader />
    </Center>
  );
}
