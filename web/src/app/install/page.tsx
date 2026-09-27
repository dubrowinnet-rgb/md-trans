import type { Metadata } from 'next';
import { InstallView } from '@/components/install/InstallView';

export const metadata: Metadata = {
  title: 'Установка приложения',
  description: 'Как установить приложение «Грузоперевозки» на Android и iPhone',
};

export default function InstallPage() {
  return <InstallView />;
}
