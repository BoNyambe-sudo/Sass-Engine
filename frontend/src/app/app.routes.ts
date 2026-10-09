import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: 'billing/success', loadComponent: () => import('./app').then(m => m.App) },
  { path: 'billing/cancel', loadComponent: () => import('./app').then(m => m.App) },
];
