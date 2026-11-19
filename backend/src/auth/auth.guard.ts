import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthenticatedRequest } from './auth.types';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.authService.extractSessionToken(req);
    const user = this.authService.getUserBySessionToken(token);

    if (!user) {
      throw new UnauthorizedException(
        'Sessão inválida ou expirada. Faça login no Hub para continuar.',
      );
    }

    req.user = user;
    return true;
  }
}
