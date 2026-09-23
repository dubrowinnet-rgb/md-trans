import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Database } from '@/types/database';

export type Vehicle = Database['public']['Tables']['vehicles']['Row'];

// Автопарк (раздел «автопарк»): заполняет админ или диспетчер, машину
// видят все — она нужна на карточке заказа и в списке водителя.
export function useVehicles() {
  return useQuery({
    queryKey: ['vehicles'],
    queryFn: async () => {
      const { data, error } = await supabase.from('vehicles').select('*').order('name', { ascending: true });
      if (error) throw error;
      return data as Vehicle[];
    },
  });
}

export interface VehicleInput {
  name: string;
  plate: string;
  capacity_kg?: number | null;
  body_dimensions?: string;
  europallet_count?: number | null;
  top_loading?: boolean;
  side_loading?: boolean;
  moscow_center_pass?: boolean;
}

export function useCreateVehicle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: VehicleInput) => {
      const { data, error } = await supabase
        .from('vehicles')
        .insert({
          name: input.name,
          plate: input.plate,
          capacity_kg: input.capacity_kg ?? null,
          body_dimensions: input.body_dimensions || null,
          europallet_count: input.europallet_count ?? null,
          top_loading: input.top_loading ?? false,
          side_loading: input.side_loading ?? false,
          moscow_center_pass: input.moscow_center_pass ?? false,
        })
        .select()
        .single();
      if (error) throw error;
      return data as Vehicle;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
    },
  });
}

export function useUpdateVehicle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: VehicleInput & { id: string }) => {
      const { error } = await supabase
        .from('vehicles')
        .update({
          name: input.name,
          plate: input.plate,
          capacity_kg: input.capacity_kg ?? null,
          body_dimensions: input.body_dimensions || null,
          europallet_count: input.europallet_count ?? null,
          top_loading: input.top_loading ?? false,
          side_loading: input.side_loading ?? false,
          moscow_center_pass: input.moscow_center_pass ?? false,
        })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
    },
  });
}

export function useDeleteVehicle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('vehicles').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
    },
  });
}
