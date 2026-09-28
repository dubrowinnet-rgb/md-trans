import type { Metadata } from 'next';
import { LandingView } from '@/components/landing/LandingView';

export const metadata: Metadata = {
  title: 'Грузоперевозки — диспетчерская в телефоне',
  description:
    'Приложение для компаний грузоперевозок: заказы, бригады, машины и клиенты в одном календаре. Мобильное приложение и веб-кабинет диспетчера на одной базе.',
};

export default function HomePage() {
  return <LandingView />;
}
