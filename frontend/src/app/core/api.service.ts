import { Injectable, signal } from '@angular/core';
import {
  HttpClient,
  HttpHeaders,
} from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

const apiBase = '/api';

export interface SessionResponse {
  accessToken: string;
  role: 'ADMIN' | 'MANAGER' | 'VIEWER';
  organizationId: string;
  user: { id: string; name: string; email: string; emailVerified: boolean };
  organization: { id: string; name: string };
  verificationToken?: string;
  invitationToken?: string;
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  readonly session = signal<SessionResponse | null>(null);

  constructor(private readonly http: HttpClient) {}

  async get<T>(path: string): Promise<T> {
    return firstValueFrom(
      this.http.get<T>(`${apiBase}/${path}`, {
        headers: this.headers(),
        withCredentials: true,
      }),
    );
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return firstValueFrom(
      this.http.post<T>(`${apiBase}/${path}`, body, {
        headers: this.headers(),
        withCredentials: true,
      }),
    );
  }

  async patch<T>(path: string, body: unknown): Promise<T> {
    return firstValueFrom(
      this.http.patch<T>(`${apiBase}/${path}`, body, {
        headers: this.headers(),
        withCredentials: true,
      }),
    );
  }

  async delete<T>(path: string): Promise<T> {
    return firstValueFrom(
      this.http.delete<T>(`${apiBase}/${path}`, {
        headers: this.headers(),
        withCredentials: true,
      }),
    );
  }

  setSession(session: SessionResponse): void {
    this.session.set(session);
  }

  clearSession(): void {
    this.session.set(null);
  }

  private headers(): HttpHeaders {
    const session = this.session();
    let headers = new HttpHeaders();
    if (session) {
      headers = headers
        .set('Authorization', `Bearer ${session.accessToken}`)
        .set('X-Organization-Id', session.organizationId);
    }
    return headers;
  }
}
