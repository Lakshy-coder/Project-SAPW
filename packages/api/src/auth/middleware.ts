import { Request, Response, NextFunction } from 'express';
import { authService } from '../auth/AuthService';
import pino from 'pino';

const logger = pino();

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    username: string;
    role: string;
    permissions: string[];
  };
}

/**
 * Middleware to require authentication on a route
 */
export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    logger.warn({ path: req.path }, 'Access denied: no token provided');
    return res.status(401).json({ error: 'AUTHENTICATION_REQUIRED' });
  }

  // Validate token asynchronously
  authService.validateToken(token)
    .then(user => {
      if (!user) {
        logger.warn({ path: req.path }, 'Access denied: invalid or expired token');
        return res.status(401).json({ error: 'INVALID_OR_EXPIRED_TOKEN' });
      }

      // Attach user to request
      req.user = {
        id: user.id,
        username: user.username,
        role: user.role,
        permissions: user.permissions
      };

      next();
    })
    .catch(error => {
      logger.error({ error: error.message, path: req.path }, 'Auth middleware error');
      res.status(500).json({ error: 'AUTH_CHECK_FAILED' });
    });
}

/**
 * Middleware to require specific permission(s)
 * User must have at least one of the required permissions
 */
export function requirePermission(...requiredPermissions: string[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'AUTHENTICATION_REQUIRED' });
    }

    // Admin wildcard permission
    if (req.user.permissions.includes('*')) {
      return next();
    }

    const hasPermission = requiredPermissions.some(p => req.user!.permissions.includes(p));

    if (!hasPermission) {
      logger.warn(
        { userId: req.user.id, requiredPermissions, userPermissions: req.user.permissions },
        'Access denied: insufficient permissions'
      );
      return res.status(403).json({ 
        error: 'PERMISSION_DENIED',
        required: requiredPermissions,
        message: `User lacks required permission(s): ${requiredPermissions.join(', ')}`
      });
    }

    next();
  };
}

/**
 * Middleware to require specific role(s)
 */
export function requireRole(...requiredRoles: Array<'ADMIN' | 'ENGINEER' | 'VIEWER'>) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'AUTHENTICATION_REQUIRED' });
    }

    if (!requiredRoles.includes(req.user.role as any)) {
      logger.warn(
        { userId: req.user.id, userRole: req.user.role, requiredRoles },
        'Access denied: insufficient role'
      );
      return res.status(403).json({
        error: 'ROLE_DENIED',
        required: requiredRoles,
        message: `User role ${req.user.role} is not authorized`
      });
    }

    next();
  };
}
