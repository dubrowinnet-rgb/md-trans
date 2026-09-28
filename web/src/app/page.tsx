import type { Metadata } from 'next';
import { LandingView } from '@/components/landing/LandingView';

export const metadata: Metadata = {
  title: 'Грузоперевозки — приложение для грузоперевозок от перевозчика',
  description:
    'Приложение, созданное специально для грузоперевозок предпринимателем с опытом больше 20 лет: заказы, водители, грузчики и машины в одном месте, СМС клиенту о записи, подтверждение заказа сотрудниками, отчёты водителей и график работы.',
};

export default function HomePage() {
  return <LandingView />;
}
