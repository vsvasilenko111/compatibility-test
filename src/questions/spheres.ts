import type { Block } from '../types';

export interface SphereInfo { id: string; block: Block; label: string }

export const SPHERES: SphereInfo[] = [
  { id: 'humor', block: 'friendship', label: 'Юмор и вайб' },
  { id: 'leisure', block: 'friendship', label: 'Досуг' },
  { id: 'rhythm', block: 'friendship', label: 'Ритм общения' },
  { id: 'loyalty', block: 'friendship', label: 'Лояльность и поддержка' },
  { id: 'honesty', block: 'friendship', label: 'Честность и границы' },
  { id: 'money', block: 'friendship', label: 'Деньги между людьми' },
  { id: 'values', block: 'friendship', label: 'Ценности и мировоззрение' },
  { id: 'conflicts', block: 'friendship', label: 'Конфликты' },
  { id: 'kids', block: 'relationship', label: 'Дети и семья' },
  { id: 'home', block: 'relationship', label: 'Быт и дом' },
  { id: 'living', block: 'relationship', label: 'Где и как жить' },
  { id: 'career', block: 'relationship', label: 'Карьера и амбиции' },
  { id: 'budget', block: 'relationship', label: 'Семейный бюджет' },
  { id: 'intimacy', block: 'relationship', label: 'Близость' },
  { id: 'space', block: 'relationship', label: 'Ревность и личное пространство' },
  { id: 'relatives', block: 'relationship', label: 'Родственники и окружение' },
  { id: 'roles', block: 'relationship', label: 'Роли и языки любви' },
];
