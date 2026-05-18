import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs';
import { Header } from '../../header/header';
import { DeliveryApi } from '../../services/delivery-api';

@Component({
  selector: 'app-track',
  imports: [Header, FormsModule],
  templateUrl: './track.html',
  styleUrl: './track.css',
})
export class Track {
  trackNumber = '';
  trackResult: any = signal(null);
  trackLoading = signal(false);
  trackResultVisible = signal(false);
  trackNumberTouched = false;
  private lastSuccessfulTrackNumber: number | null = null;

  constructor(private deliveryApi: DeliveryApi) {}

  isTrackNumberValid(): boolean {
    const rawValue = this.trackNumber.trim();
    if (!rawValue) {
      return false;
    }

    if (!/^\d+$/.test(rawValue)) {
      return false;
    }

    return Number(rawValue) > 0;
  }

  isTrackNumberEmptyErrorVisible(): boolean {
    return this.trackNumberTouched && this.trackNumber.trim().length === 0;
  }

  isTrackNumberFormatErrorVisible(): boolean {
    const rawValue = this.trackNumber.trim();
    if (!this.trackNumberTouched || rawValue.length === 0) {
      return false;
    }

    return !this.isTrackNumberValid();
  }

  isTrackFieldInvalid(): boolean {
    return this.isTrackNumberEmptyErrorVisible() || this.isTrackNumberFormatErrorVisible();
  }

  onTrackNumberBlur(): void {
    this.trackNumberTouched = true;
  }

  trackShipment(): void {
    this.trackNumberTouched = true;
    const rawValue = this.trackNumber.trim();

    if (!this.isTrackNumberValid()) {
      this.trackResultVisible.set(false);
      return;
    }

    const numericValue = Number(rawValue);
    const isSameAsLastSuccessful = this.lastSuccessfulTrackNumber === numericValue;

    this.trackResultVisible.set(true);
    if (!isSameAsLastSuccessful) {
      this.trackResult.set(null);
    }
    this.trackLoading.set(true);

    this.deliveryApi
      .getDeliveryInfo(numericValue)
      .pipe(finalize(() => this.trackLoading.set(false)))
      .subscribe((response) => {
        if ('error' in response) {
          alert(response.error);
          const hasPreviousResult = this.trackResult() !== null;
          if (isSameAsLastSuccessful && hasPreviousResult) {
            this.trackResultVisible.set(true);
            return;
          }

          this.trackResult.set(null);
          this.trackResultVisible.set(false);
          return;
        }

        this.trackResult.set(response);
        this.lastSuccessfulTrackNumber = numericValue;
      });
  }
}
