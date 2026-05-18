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
  private lastSuccessfulTrackNumber: number | null = null;

  constructor(private deliveryApi: DeliveryApi) {}

  trackShipment(): void {
    const rawValue = this.trackNumber.trim();

    if (!rawValue) {
      alert('Заполните номер отправления');
      this.trackResultVisible.set(false);
      return;
    }

    const numericValue = Number(rawValue);
    if (Number.isNaN(numericValue) || numericValue <= 0) {
      alert('Введите корректный номер отправления');
      this.trackResultVisible.set(false);
      return;
    }

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
