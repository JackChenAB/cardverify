import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { CryptoService } from './crypto.service';

/**
 * Signs every client-API response with Ed25519. The wire format is
 *   { payload: "<json string>", sig: "<base64>" }
 * The client verifies `sig` over the exact `payload` bytes, then JSON.parses it.
 * This makes a "valid:true" answer unforgeable without the server private key.
 */
@Injectable()
export class ResponseSignInterceptor implements NestInterceptor {
  constructor(private readonly crypto: CryptoService) {}

  intercept(_ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(map((data) => this.crypto.signPayload(data)));
  }
}
