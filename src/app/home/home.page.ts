import { Component, AfterViewInit, NgZone, OnDestroy } from '@angular/core';
import { AlertController, ToastController } from '@ionic/angular';
import { Geolocation } from '@capacitor/geolocation';
import * as L from 'leaflet';
import { MapService } from '../services/map.service';
import { Punto, Ruta } from '../models/route.model';

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  standalone: false
})
export class HomePage implements AfterViewInit, OnDestroy {
  map!: L.Map;
  puntos: Punto[] = [];
  rutasGuardadas: Ruta[] = [];
  rutaActual: L.Polyline | L.GeoJSON | null = null;
  marcadores: L.Marker[] = [];
  distanciaActual = 0;
  cargando = false;
  trazando = false;
  routesOpen = false;

  constructor(
    private alertCtrl: AlertController,
    private toastCtrl: ToastController,
    private mapService: MapService,
    private ngZone: NgZone
  ) {}

  ngAfterViewInit() {
    // Expone función global para que los popups de Leaflet puedan llamar a Angular
    (window as any).__mapperDelete = (index: number) => {
      this.ngZone.run(() => this.eliminarPuntoEspecifico(index));
    };

    setTimeout(() => {
      this.cargarMapa();
      this.rutasGuardadas = this.mapService.loadRutas();
      this.puntos = this.mapService.loadPuntos();
      this.distanciaActual = this.mapService.calculateDistance(this.puntos);
      if (this.puntos.length > 0) this.redibujarMarcadores();
    }, 300);
  }

  ngOnDestroy() {
    delete (window as any).__mapperDelete;
  }

  private cargarMapa() {
    this.map = L.map('mapId', {
      zoomControl: false,
      attributionControl: false
    }).setView([4.60971, -74.08175], 13);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '© OpenStreetMap © CartoDB',
      subdomains: 'abcd',
      maxZoom: 19
    }).addTo(this.map);

    L.control.zoom({ position: 'topright' }).addTo(this.map);

    this.map.on('click', (e: L.LeafletMouseEvent) => {
      this.agregarPuntoEnCoordenada(e.latlng.lat, e.latlng.lng);
    });

    setTimeout(() => this.map.invalidateSize(), 300);
  }

  private crearIcono(numero: number): L.DivIcon {
    return L.divIcon({
      html: `<div class="marker-pin"><span>${numero}</span></div>`,
      className: '',
      iconSize: [34, 42],
      iconAnchor: [17, 42],
      popupAnchor: [0, -42]
    });
  }

  private crearPopupHtml(index: number): string {
    const p = this.puntos[index];
    return `
      <div class="mp-popup">
        <b>Punto ${index + 1}</b>
        <small>${p.coordenadas[0].toFixed(5)}, ${p.coordenadas[1].toFixed(5)}</small>
        <button onclick="window.__mapperDelete(${index})">
          🗑 Eliminar punto
        </button>
      </div>`;
  }

  private redibujarMarcadores() {
    this.marcadores.forEach(m => this.map.removeLayer(m));
    this.marcadores = [];

    this.puntos.forEach((punto, i) => {
      const marker = L.marker(punto.coordenadas as L.LatLngExpression, {
        icon: this.crearIcono(i + 1)
      })
        .addTo(this.map)
        .bindPopup(this.crearPopupHtml(i));
      this.marcadores.push(marker);
    });
  }

  private agregarPuntoEnCoordenada(lat: number, lng: number) {
    const index = this.puntos.length;
    const numero = index + 1;

    this.puntos.push({ nombre: `Punto ${numero}`, coordenadas: [lat, lng], timestamp: Date.now() });
    this.mapService.savePuntos(this.puntos);
    this.distanciaActual = this.mapService.calculateDistance(this.puntos);

    const marker = L.marker([lat, lng], { icon: this.crearIcono(numero) })
      .addTo(this.map)
      .bindPopup(this.crearPopupHtml(index))
      .openPopup();

    this.marcadores.push(marker);
  }

  eliminarPuntoEspecifico(index: number) {
    this.puntos.splice(index, 1);
    this.mapService.savePuntos(this.puntos);
    this.distanciaActual = this.mapService.calculateDistance(this.puntos);

    if (this.rutaActual) { this.map.removeLayer(this.rutaActual); this.rutaActual = null; }

    this.redibujarMarcadores();
    this.toast('Punto eliminado', 'warning');
  }

  async obtenerPunto() {
    this.cargando = true;
    try {
      const pos = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      });
      const { latitude: lat, longitude: lng } = pos.coords;
      this.agregarPuntoEnCoordenada(lat, lng);
      this.map.setView([lat, lng], Math.max(this.map.getZoom(), 16), { animate: true });
      await this.toast(`Punto ${this.puntos.length} capturado (GPS)`, 'success');
    } catch {
      await this.toast('No se pudo obtener la ubicación', 'danger');
    } finally {
      this.cargando = false;
    }
  }

  async deshacerPunto() {
    if (this.puntos.length === 0) {
      await this.toast('No hay puntos para deshacer', 'warning');
      return;
    }
    this.puntos.pop();
    this.mapService.savePuntos(this.puntos);
    this.distanciaActual = this.mapService.calculateDistance(this.puntos);
    if (this.rutaActual) { this.map.removeLayer(this.rutaActual); this.rutaActual = null; }
    this.redibujarMarcadores();
    await this.toast('Último punto eliminado', 'warning');
  }

  async trazar() {
    if (this.puntos.length < 2) {
      await this.toast('Necesitas al menos 2 puntos', 'warning');
      return;
    }

    if (this.rutaActual) { this.map.removeLayer(this.rutaActual); this.rutaActual = null; }

    this.trazando = true;
    try {
      const coords = this.puntos
        .map(p => `${p.coordenadas[1]},${p.coordenadas[0]}`)
        .join(';');

      const res = await fetch(
        `https://router.project-osrm.org/route/v1/driving/${coords}?geometries=geojson&overview=full`
      );
      const data = await res.json();

      if (data.code === 'Ok' && data.routes?.[0]) {
        this.rutaActual = L.geoJSON(data.routes[0].geometry, {
          style: { color: '#6C63FF', weight: 5, opacity: 0.9 }
        }).addTo(this.map);
      } else {
        throw new Error('Sin ruta');
      }
    } catch {
      await this.toast('Sin conexión — trazando línea recta', 'warning');
      this.rutaActual = L.polyline(
        this.puntos.map(p => p.coordenadas),
        { color: '#6C63FF', weight: 5, opacity: 0.9, dashArray: '8 6' }
      ).addTo(this.map);
    } finally {
      this.trazando = false;
    }

    const bounds = (this.rutaActual as any).getBounds?.();
    if (bounds?.isValid()) {
      this.map.fitBounds(bounds, { padding: [50, 50], animate: true });
    }
  }

  async guardarRuta() {
    if (this.puntos.length < 2) {
      await this.toast('Necesitas al menos 2 puntos para guardar', 'warning');
      return;
    }
    const defaultName = `Ruta ${this.rutasGuardadas.length + 1}`;
    const alert = await this.alertCtrl.create({
      header: 'Guardar Ruta',
      message: 'Dale un nombre a tu ruta',
      cssClass: 'mapper-alert',
      inputs: [{ name: 'nombre', type: 'text', placeholder: defaultName, value: defaultName }],
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Guardar',
          cssClass: 'alert-btn-guardar',
          handler: (data) => {
            const nombre = data.nombre?.trim() || defaultName;
            const ruta: Ruta = {
              id: this.mapService.generateId(),
              nombre,
              puntos: [...this.puntos],
              distancia: this.mapService.calculateDistance(this.puntos),
              fecha: new Date().toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }),
              color: this.mapService.getRouteColor(this.rutasGuardadas.length)
            };
            this.rutasGuardadas.push(ruta);
            this.mapService.saveRutas(this.rutasGuardadas);

            // Limpiar sesión actual para empezar una nueva ruta
            this.puntos = [];
            this.distanciaActual = 0;
            this.mapService.savePuntos([]);
            this.marcadores.forEach(m => this.map.removeLayer(m));
            this.marcadores = [];
            if (this.rutaActual) { this.map.removeLayer(this.rutaActual); this.rutaActual = null; }

            this.toast(`"${nombre}" guardada — puedes empezar una nueva ruta`, 'success');
          }
        }
      ]
    });
    await alert.present();
  }

  async verRuta(ruta: Ruta) {
    this.routesOpen = false;
    if (this.rutaActual) { this.map.removeLayer(this.rutaActual); this.rutaActual = null; }

    this.trazando = true;
    try {
      const coords = ruta.puntos
        .map(p => `${p.coordenadas[1]},${p.coordenadas[0]}`)
        .join(';');

      const res = await fetch(
        `https://router.project-osrm.org/route/v1/driving/${coords}?geometries=geojson&overview=full`
      );
      const data = await res.json();

      if (data.code === 'Ok' && data.routes?.[0]) {
        this.rutaActual = L.geoJSON(data.routes[0].geometry, {
          style: { color: ruta.color, weight: 5, opacity: 0.9 }
        }).addTo(this.map);
      } else {
        throw new Error('Sin ruta');
      }
    } catch {
      this.rutaActual = L.polyline(
        ruta.puntos.map(p => p.coordenadas),
        { color: ruta.color, weight: 5, opacity: 0.9, dashArray: '8 6' }
      ).addTo(this.map);
    } finally {
      this.trazando = false;
    }

    const bounds = (this.rutaActual as any).getBounds?.();
    if (bounds?.isValid()) {
      this.map.fitBounds(bounds, { padding: [50, 50], animate: true });
    }
  }

  async eliminarRuta(ruta: Ruta, event: Event) {
    event.stopPropagation();
    const alert = await this.alertCtrl.create({
      header: 'Eliminar Ruta',
      message: `¿Eliminar "${ruta.nombre}"?`,
      cssClass: 'mapper-alert',
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Eliminar',
          role: 'destructive',
          cssClass: 'alert-btn-danger',
          handler: () => {
            this.rutasGuardadas = this.rutasGuardadas.filter(r => r.id !== ruta.id);
            this.mapService.saveRutas(this.rutasGuardadas);
            this.toast(`"${ruta.nombre}" eliminada`, 'danger');
          }
        }
      ]
    });
    await alert.present();
  }

  async centrarEnUbicacion() {
    this.cargando = true;
    try {
      const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true });
      this.map.setView([pos.coords.latitude, pos.coords.longitude], 17, { animate: true });
    } catch {
      await this.toast('No se pudo obtener la ubicación', 'danger');
    } finally {
      this.cargando = false;
    }
  }

  async borrarTodo() {
    if (this.puntos.length === 0 && this.rutasGuardadas.length === 0) {
      await this.toast('No hay datos para borrar', 'warning');
      return;
    }
    const alert = await this.alertCtrl.create({
      header: 'Borrar Todo',
      message: 'Se eliminarán todos los puntos y rutas guardadas. Esta acción no se puede deshacer.',
      cssClass: 'mapper-alert',
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Borrar Todo',
          role: 'destructive',
          cssClass: 'alert-btn-danger',
          handler: () => {
            this.mapService.clearAll();
            this.puntos = [];
            this.rutasGuardadas = [];
            this.distanciaActual = 0;
            this.marcadores.forEach(m => this.map.removeLayer(m));
            this.marcadores = [];
            if (this.rutaActual) { this.map.removeLayer(this.rutaActual); this.rutaActual = null; }
            this.toast('Todos los datos eliminados', 'danger');
          }
        }
      ]
    });
    await alert.present();
  }

  formatDistance(meters: number): string {
    return this.mapService.formatDistance(meters);
  }

  private async toast(message: string, color: 'success' | 'danger' | 'warning' | 'primary') {
    const t = await this.toastCtrl.create({
      message, duration: 2500, color, position: 'top', cssClass: 'mapper-toast'
    });
    await t.present();
  }
}
