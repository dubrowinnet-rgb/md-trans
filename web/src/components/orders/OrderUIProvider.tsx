'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { OrderWithDetails } from '@/api/orders';
import { OrderDrawer } from './OrderDrawer';
import { OrderFormModal, type OrderFormPreset } from './OrderFormModal';
import { CopyMoveModal } from './CopyMoveModal';
import { ClientModal } from '@/components/clients/ClientModal';

type FormState = { mode: 'new'; preset: OrderFormPreset } | { mode: 'edit'; order: OrderWithDetails } | null;
type CopyState = { order: OrderWithDetails; mode: 'copy' | 'move' } | null;

interface OrderUI {
  openOrder: (orderId: string) => void;
  openNewOrder: (preset?: OrderFormPreset) => void;
  openEditOrder: (order: OrderWithDetails) => void;
  openCopyMove: (order: OrderWithDetails, mode: 'copy' | 'move') => void;
  openClient: (clientId: string) => void;
}

const OrderUIContext = createContext<OrderUI | null>(null);

// Карточка заказа, форма заказа, копирование/перенос и карточка клиента
// открываются поверх любой страницы кабинета (календарь, список заказов,
// клиенты) — поэтому живут здесь, а не на каждой странице отдельно.
export function OrderUIProvider({ children }: { children: ReactNode }) {
  const [viewOrderId, setViewOrderId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(null);
  const [copy, setCopy] = useState<CopyState>(null);
  const [clientId, setClientId] = useState<string | null>(null);

  const openOrder = useCallback((id: string) => setViewOrderId(id), []);
  const openNewOrder = useCallback((preset: OrderFormPreset = {}) => setForm({ mode: 'new', preset }), []);
  const openEditOrder = useCallback((order: OrderWithDetails) => setForm({ mode: 'edit', order }), []);
  const openCopyMove = useCallback((order: OrderWithDetails, mode: 'copy' | 'move') => setCopy({ order, mode }), []);
  const openClient = useCallback((id: string) => setClientId(id), []);

  const value = useMemo(
    () => ({ openOrder, openNewOrder, openEditOrder, openCopyMove, openClient }),
    [openOrder, openNewOrder, openEditOrder, openCopyMove, openClient]
  );

  return (
    <OrderUIContext.Provider value={value}>
      {children}
      <OrderDrawer orderId={viewOrderId} onClose={() => setViewOrderId(null)} />
      {form && (
        <OrderFormModal
          key={form.mode === 'edit' ? form.order.id : 'new'}
          order={form.mode === 'edit' ? form.order : null}
          preset={form.mode === 'new' ? form.preset : {}}
          onClose={() => setForm(null)}
          onSaved={(id) => {
            setForm(null);
            setViewOrderId(id);
          }}
        />
      )}
      {copy && (
        <CopyMoveModal
          order={copy.order}
          mode={copy.mode}
          onClose={() => setCopy(null)}
          onDone={(id) => {
            setCopy(null);
            setViewOrderId(id);
          }}
        />
      )}
      {clientId && <ClientModal clientId={clientId} onClose={() => setClientId(null)} />}
    </OrderUIContext.Provider>
  );
}

export function useOrderUI() {
  const ctx = useContext(OrderUIContext);
  if (!ctx) throw new Error('useOrderUI вне OrderUIProvider');
  return ctx;
}
