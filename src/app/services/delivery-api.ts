import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { catchError, Observable, of } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root',
})
export class DeliveryApi {
  private readonly deliveriesApiBaseUrl: string;
  private readonly createPath = 'create';
  private readonly infoPath = 'info';

  constructor(private http: HttpClient) {
    this.deliveriesApiBaseUrl = environment.deliveriesApiUrl.endsWith('/')
      ? environment.deliveriesApiUrl
      : `${environment.deliveriesApiUrl}/`;
  }

  createDelivery(payload: any): Observable<any> {
    return this.http
      .post<any>(`${this.deliveriesApiBaseUrl}${this.createPath}`, payload)
      .pipe(catchError((err) => of({ error: err?.error?.error ?? 'Ошибка при создании заявки' })));
  }

  getDeliveryInfo(id: number): Observable<any> {
    return this.http
      .get<any>(`${this.deliveriesApiBaseUrl}${this.infoPath}`, { params: { id } })
      .pipe(
        catchError((err) => of({ error: err?.error?.error ?? 'Ошибка при получении статуса' }))
      );
  }
}
