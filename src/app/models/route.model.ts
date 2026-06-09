export interface Punto {
  nombre: string;
  coordenadas: [number, number];
  timestamp: number;
}

export interface Ruta {
  id: string;
  nombre: string;
  puntos: Punto[];
  distancia: number;
  fecha: string;
  color: string;
}
