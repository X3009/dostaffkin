import { UpperCasePipe } from '@angular/common';
import { AfterViewInit, Component, OnDestroy, signal } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { environment } from '../../../environments/environment';
import { Header } from '../../header/header';
import { DeliveryApi } from '../../services/delivery-api';
import { DELIVERY_SIZES, DELIVERY_SPEEDS } from './order.config';
type RouteField = 'from' | 'to';

declare global {
  interface Window {
    google?: any;
    __googleMapsInit?: () => void;
    __googleMapsInitError?: () => void;
    gm_authFailure?: () => void;
  }
}

@Component({
  selector: 'app-order',
  imports: [Header, UpperCasePipe, ReactiveFormsModule],
  templateUrl: './order.html',
  styleUrl: './order.css',
})
export class Order implements AfterViewInit, OnDestroy {
  public readonly sizes = DELIVERY_SIZES;
  public readonly speeds = DELIVERY_SPEEDS;

  public routeForm: FormGroup;
  public orderForm: FormGroup;

  public orderId: any = signal(null);
  public calculationResult: any = signal(null);

  private map: any = null;
  private routeClass: any = null;
  private routePolylines: any[] = [];
  private placesReady = false;

  private fromAutocompleteElement: any = null;
  private toAutocompleteElement: any = null;
  private fromSelectHandler: ((event: any) => void | Promise<void>) | null = null;
  private toSelectHandler: ((event: any) => void | Promise<void>) | null = null;
  private fromBlurHandler: (() => void) | null = null;
  private toBlurHandler: (() => void) | null = null;

  private readonly mapCenter = { lat: 55.751244, lng: 37.618423 };
  private readonly mapApiKey: string;

  constructor(
    private formBuilder: FormBuilder,
    private deliveryApi: DeliveryApi
  ) {
    this.routeForm = this.formBuilder.group({
      from: ['', Validators.required],
      to: ['', Validators.required],
      size: ['xs', Validators.required],
      speed: ['regular', Validators.required],
    });

    this.orderForm = this.formBuilder.group({
      name: ['', Validators.required],
      phone: ['', [Validators.required]],
      comment: [''],
    });

    this.mapApiKey = this.normalizeEnvValue(environment.googleMapsApiKey);
  }

  public async ngAfterViewInit(): Promise<void> {
    if (!this.mapApiKey) {
      return;
    }

    try {
      await this.loadGoogleMapsApi(this.mapApiKey);
      await this.initMapAndLibraries();
      if (this.placesReady) {
        this.initPlaceAutocomplete();
      }
    } catch {
      this.map = null;
      this.routeClass = null;
    }
  }

  public ngOnDestroy(): void {
    this.detachAutocompleteListeners();
    this.clearRouteGraphics();
    this.map = null;
    this.routeClass = null;
    delete window.gm_authFailure;
  }

  public selectSize(size: string): void {
    this.routeForm.controls['size'].setValue(size);
  }

  public selectSpeed(speed: string): void {
    this.routeForm.controls['speed'].setValue(speed);
  }

  public async calculate(): Promise<void> {
    this.calculationResult.set(null);

    if (this.routeForm.invalid) {
      return;
    }

    if (!this.map || !this.routeClass) {
      alert('Карта недоступна. Проверьте GOOGLE_MAPS_API_KEY и доступность Google Maps API.');
      return;
    }

    const { from, to, size, speed } = this.routeForm.getRawValue();

    try {
      const request = {
        origin: from,
        destination: to,
        travelMode: 'DRIVING',
        fields: ['path', 'legs'],
      };

      const response = await this.routeClass.computeRoutes(request);
      const routes = response?.routes;
      const route = routes?.[0];

      if (!route) {
        this.failedCalculation();
        return;
      }

      this.renderRoute(route);

      const legs = route.legs ?? [];
      const distanceMeters = legs.reduce((sum: number, leg: any) => {
        const value = Number(leg?.distanceMeters);
        return Number.isFinite(value) ? sum + value : sum;
      }, 0);

      if (!Number.isFinite(distanceMeters) || distanceMeters <= 0) {
        this.failedCalculation();
        return;
      }

      this.applyCalculation({ from, to, size, speed, distanceMeters });
    } catch {
      this.failedCalculation();
    }
  }

  public submitOrder(): void {
    const calculation = this.calculationResult();
    if (!calculation) {
      alert('Сначала рассчитайте стоимость, чтобы оформить заявку');
      return;
    }

    if (this.orderForm.invalid) {
      alert('Введите имя и корректный телефон');
      return;
    }

    const { name, phone, comment } = this.orderForm.getRawValue();
    const trimmedName = (name ?? '').trim();
    const trimmedPhone = (phone ?? '').trim();
    const trimmedComment = (comment ?? '').trim();

    const payload = {
      customer: { name: trimmedName, phone: trimmedPhone, comment: trimmedComment },
      calculation: calculation,
      createdAt: new Date().toISOString(),
    };

    this.deliveryApi.createDelivery(payload).subscribe((response) => {
      if ('error' in response) {
        alert(response.error);
        return;
      }

      this.orderId.set(response.id);
    });
  }

  private async initMapAndLibraries(): Promise<void> {
    const googleMaps = window.google?.maps;
    if (!googleMaps?.importLibrary) {
      throw new Error('google.maps.importLibrary is unavailable');
    }

    const mapNode = document.getElementById('map');
    if (!mapNode) {
      throw new Error('Map container #map not found');
    }

    const mapsLib = await googleMaps.importLibrary('maps');

    this.map = new mapsLib.Map(mapNode, {
      center: this.mapCenter,
      zoom: 5,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
      zoomControl: true,
    });

    setTimeout(() => {
      try {
        window.google?.maps?.event?.trigger(this.map, 'resize');
        this.map?.setCenter?.(this.mapCenter);
      } catch {
        // no-op
      }
    }, 0);

    try {
      const routesLib = await googleMaps.importLibrary('routes');
      this.routeClass = routesLib?.Route ?? null;
    } catch {
      this.routeClass = null;
    }

    try {
      await googleMaps.importLibrary('places');
      this.placesReady = true;
    } catch {
      this.placesReady = false;
    }
  }

  private initPlaceAutocomplete(): void {
    const googleMaps = window.google?.maps;
    const placeCtor = googleMaps?.places?.PlaceAutocompleteElement;
    if (!placeCtor) {
      return;
    }

    const fromHost = document.getElementById('fromAutocompleteHost');
    const toHost = document.getElementById('toAutocompleteHost');

    if (!fromHost || !toHost) {
      return;
    }

    fromHost.innerHTML = '';
    toHost.innerHTML = '';

    this.fromAutocompleteElement = new placeCtor({});
    this.toAutocompleteElement = new placeCtor({});

    this.fromAutocompleteElement.setAttribute('placeholder', 'Откуда: начните вводить адрес');
    this.toAutocompleteElement.setAttribute('placeholder', 'Куда: начните вводить адрес');
    this.fromAutocompleteElement.setAttribute('aria-label', 'Откуда');
    this.toAutocompleteElement.setAttribute('aria-label', 'Куда');

    fromHost.appendChild(this.fromAutocompleteElement);
    toHost.appendChild(this.toAutocompleteElement);

    this.fromSelectHandler = async (event: any) => {
      await this.applySelectedPlace(event, 'from');
    };

    this.toSelectHandler = async (event: any) => {
      await this.applySelectedPlace(event, 'to');
    };

    this.fromBlurHandler = () => {
      this.routeForm.controls['from'].markAsTouched();
    };

    this.toBlurHandler = () => {
      this.routeForm.controls['to'].markAsTouched();
    };

    this.fromAutocompleteElement.addEventListener('gmp-select', this.fromSelectHandler);
    this.toAutocompleteElement.addEventListener('gmp-select', this.toSelectHandler);
    this.fromAutocompleteElement.addEventListener('blur', this.fromBlurHandler);
    this.toAutocompleteElement.addEventListener('blur', this.toBlurHandler);
  }

  private async applySelectedPlace(event: any, field: RouteField): Promise<void> {
    const prediction = event?.placePrediction;
    if (!prediction?.toPlace) {
      return;
    }

    const place = prediction.toPlace();
    await place.fetchFields({
      fields: ['displayName', 'formattedAddress'],
    });

    const label = (place.formattedAddress ?? place.displayName ?? '').trim();
    if (!label) {
      return;
    }

    this.routeForm.controls[field].setValue(label);
    this.routeForm.controls[field].markAsTouched();
  }

  private renderRoute(route: any): void {
    this.clearRouteGraphics();

    const polylines = route.createPolylines?.() ?? [];
    this.routePolylines = Array.isArray(polylines) ? polylines : [];

    this.routePolylines.forEach((polyline) => {
      polyline.setMap(this.map);
    });

    const path = route.path ?? [];
    if (!Array.isArray(path) || path.length === 0) {
      return;
    }

    const bounds = new window.google.maps.LatLngBounds();
    path.forEach((point: any) => bounds.extend(point));
    this.map.fitBounds(bounds);
  }

  private clearRouteGraphics(): void {
    this.routePolylines.forEach((polyline) => polyline?.setMap?.(null));
    this.routePolylines = [];
  }

  private detachAutocompleteListeners(): void {
    if (this.fromAutocompleteElement && this.fromSelectHandler) {
      this.fromAutocompleteElement.removeEventListener('gmp-select', this.fromSelectHandler);
    }
    if (this.fromAutocompleteElement && this.fromBlurHandler) {
      this.fromAutocompleteElement.removeEventListener('blur', this.fromBlurHandler);
    }

    if (this.toAutocompleteElement && this.toSelectHandler) {
      this.toAutocompleteElement.removeEventListener('gmp-select', this.toSelectHandler);
    }
    if (this.toAutocompleteElement && this.toBlurHandler) {
      this.toAutocompleteElement.removeEventListener('blur', this.toBlurHandler);
    }

    this.fromSelectHandler = null;
    this.toSelectHandler = null;
    this.fromBlurHandler = null;
    this.toBlurHandler = null;
    this.fromAutocompleteElement = null;
    this.toAutocompleteElement = null;
  }

  private applyCalculation(input: {
    from: string;
    to: string;
    size: string;
    speed: string;
    distanceMeters: number;
  }): void {
    const km = input.distanceMeters / 1000;

    const sizeConfig = this.sizes.find((item) => item.value === input.size);
    if (!sizeConfig) {
      this.failedCalculation();
      return;
    }

    let total = Math.max(sizeConfig.min, Math.ceil(km * sizeConfig.rate));
    let duration = Math.min(30, 1 + Math.ceil(km / 80));

    if (input.speed === 'fast') {
      total = Math.ceil(total * 1.15);
      duration = Math.ceil(duration - duration * 0.3);
    }

    this.calculationResult.set({
      from: input.from,
      to: input.to,
      size: input.size,
      distance: km.toFixed(1),
      duration,
      rate: sizeConfig.rate,
      total,
      speed: input.speed,
    });
  }

  private failedCalculation(message?: string): void {
    this.calculationResult.set(null);
    alert(message ?? 'Не удалось построить маршрут. Проверьте адреса и выбранные параметры.');
  }

  private normalizeEnvValue(value: string | undefined): string {
    const normalized = (value ?? '').trim();
    return normalized.length > 0 ? normalized : '';
  }

  private loadGoogleMapsApi(apiKey: string): Promise<void> {
    if (window.google?.maps?.Map) {
      return Promise.resolve();
    }

    const existing = document.getElementById('google-maps-sdk') as HTMLScriptElement | null;
    if (existing) {
      return new Promise((resolve, reject) => {
        existing.addEventListener('load', () => resolve(), { once: true });
        existing.addEventListener('error', () => reject(new Error('Google Maps SDK load failed')), {
          once: true,
        });
      });
    }

    return new Promise((resolve, reject) => {
      window.gm_authFailure = () => {
        reject(new Error('Google Maps authentication failed'));
      };

      window.__googleMapsInit = () => {
        resolve();
        delete window.__googleMapsInit;
        delete window.__googleMapsInitError;
        delete window.gm_authFailure;
      };

      window.__googleMapsInitError = () => {
        reject(new Error('Google Maps SDK load failed'));
        delete window.__googleMapsInit;
        delete window.__googleMapsInitError;
        delete window.gm_authFailure;
      };

      const script = document.createElement('script');
      script.id = 'google-maps-sdk';
      script.src =
        `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}` +
        '&loading=async&libraries=places,routes&language=ru&region=RU&callback=__googleMapsInit';
      script.async = true;
      script.defer = true;
      script.onerror = () => {
        if (window.__googleMapsInitError) {
          window.__googleMapsInitError();
        }
      };

      document.head.appendChild(script);
    });
  }
}
