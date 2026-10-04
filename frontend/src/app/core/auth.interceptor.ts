import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, from, switchMap, throwError } from 'rxjs';
import { ApiService, SKIP_AUTH_REFRESH } from './api.service';

export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const api = inject(ApiService);
  const session = api.session();
  const authenticatedRequest = session
    ? request.clone({
        setHeaders: {
          Authorization: `Bearer ${session.accessToken}`,
          'X-Organization-Id': session.organizationId,
        },
        withCredentials: true,
      })
    : request.clone({ withCredentials: true });

  return next(authenticatedRequest).pipe(
    catchError((error: unknown) => {
      const isUnauthorized =
        typeof error === 'object' &&
        error !== null &&
        'status' in error &&
        error.status === 401;
      if (
        !isUnauthorized ||
        !session ||
        request.context.get(SKIP_AUTH_REFRESH) ||
        request.url.includes('/auth/')
      ) {
        return throwError(() => error);
      }

      return from(api.refreshSession()).pipe(
        switchMap((refreshed) =>
          next(
            request.clone({
              setHeaders: {
                Authorization: `Bearer ${refreshed.accessToken}`,
                'X-Organization-Id': refreshed.organizationId,
              },
              withCredentials: true,
            }),
          ),
        ),
      );
    }),
  );
};
