import { Injectable } from '@angular/core';
import { Punto, Ruta } from '../models/route.model';

@Injectable({ providedIn: 'root' })
export class MapService {
  private readonly PUNTOS_KEY = 'mapper_puntos';
  private readonly RUTAS_KEY = 'mapper_rutas';

  private readonly COLORS = [
    '#6C63FF', '#FF6584', '#43D9AD', '#FFB347',
    '#87CEEB', '#FF7F7F', '#B5EAD7', '#FFDAC1',
    '#C7CEEA', '#E2B4BD'
  ];

  savePuntos(puntos: Punto[]): void {
    localStorage.setItem(this.PUNTOS_KEY, JSON.stringify(puntos));
  }

  loadPuntos(): Punto[] {
    const data = localStorage.getItem(this.PUNTOS_KEY);
    return data ? JSON.parse(data) : [];
  }

  saveRutas(rutas: Ruta[]): void {
    localStorage.setItem(this.RUTAS_KEY, JSON.stringify(rutas));
  }

  loadRutas(): Ruta[] {
    const data = localStorage.getItem(this.RUTAS_KEY);
    return data ? JSON.parse(data) : [];
  }

  clearAll(): void {
    localStorage.removeItem(this.PUNTOS_KEY);
    localStorage.removeItem(this.RUTAS_KEY);
  }

  calculateDistance(puntos: Punto[]): number {
    if (puntos.length < 2) return 0;
    let total = 0;
    for (let i = 1; i < puntos.length; i++) {
      total += this.haversine(puntos[i - 1].coordenadas, puntos[i].coordenadas);
    }
    return Math.round(total);
  }

  formatDistance(meters: number): string {
    if (meters < 1000) return `${meters} m`;
    return `${(meters / 1000).toFixed(2)} km`;
  }

  getRouteColor(index: number): string {
    return this.COLORS[index % this.COLORS.length];
  }

  generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substring(2);
  }

  private haversine(a: [number, number], b: [number, number]): number {
    const R = 6371000;
    const dLat = (b[0] - a[0]) * Math.PI / 180;
    const dLng = (b[1] - a[1]) * Math.PI / 180;
    const lat1 = a[0] * Math.PI / 180;
    const lat2 = b[0] * Math.PI / 180;
    const x =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  }
}
