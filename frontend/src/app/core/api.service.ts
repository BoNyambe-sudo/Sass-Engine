import { Injectable, signal } from '@angular/core';
import { HttpClient, HttpContext, HttpContextToken } from '@angular/common/http';
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

export const SKIP_AUTH_REFRESH = new HttpContextToken(() => false);

@Injectable({ providedIn: 'root' })
export class ApiService {
  readonly session = signal<SessionResponse | null>(null);
  private refreshPromise: Promise<SessionResponse> | null = null;

  constructor(private readonly http: HttpClient) {}

  async get<T>(path: string): Promise<T> {
    return firstValueFrom(
      this.http.get<T>(`${apiBase}/${path}`, {
        withCredentials: true,
      }),
    );
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return firstValueFrom(
      this.http.post<T>(`${apiBase}/${path}`, body, {
        withCredentials: true,
      }),
    );
  }

  async patch<T>(path: string, body: unknown): Promise<T> {
    return firstValueFrom(
      this.http.patch<T>(`${apiBase}/${path}`, body, {
        withCredentials: true,
      }),
    );
  }

  async delete<T>(path: string): Promise<T> {
    return firstValueFrom(
      this.http.delete<T>(`${apiBase}/${path}`, {
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

  refreshSession(): Promise<SessionResponse> {
    if (!this.refreshPromise) {
      this.refreshPromise = firstValueFrom(
        this.http.post<SessionResponse>(
          `${apiBase}/auth/refresh`,
          {},
          {
            withCredentials: true,
            context: new HttpContext().set(SKIP_AUTH_REFRESH, true),
          },
        ),
      )
        .then((session) => {
          this.setSession(session);
          return session;
        })
        .catch((error: unknown) => {
          this.clearSession();
          throw error;
        })
        .finally(() => {
          this.refreshPromise = null;
        });
    }
    return this.refreshPromise;
  }
}
