import { Router, Request, Response, NextFunction } from 'express';
import { authService } from '../auth/AuthService';

const router = Router();

// POST /api/auth/login
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'USERNAME_AND_PASSWORD_REQUIRED' });
    }

    const result = await authService.login(username, password);
    
    if (!result) {
      return res.status(401).json({ error: 'INVALID_CREDENTIALS' });
    }

    const { user, session } = result;

    // Do not send password hash
    const safeUser = {
      id: user.id,
      username: user.username,
      role: user.role,
      permissions: user.permissions
    };

    res.json({
      user: safeUser,
      session: {
        token: session.token,
        refreshToken: session.refreshToken,
        expiresAt: session.expiresAt
      }
    });
  } catch (error: any) {
    res.status(500).json({ error: 'LOGIN_FAILED', message: error.message });
  }
});

// POST /api/auth/refresh
router.post('/refresh', async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({ error: 'REFRESH_TOKEN_REQUIRED' });
    }

    const session = await authService.refreshToken(refreshToken);

    if (!session) {
      return res.status(401).json({ error: 'INVALID_OR_EXPIRED_REFRESH_TOKEN' });
    }

    res.json({
      token: session.token,
      refreshToken: session.refreshToken,
      expiresAt: session.expiresAt
    });
  } catch (error: any) {
    res.status(500).json({ error: 'REFRESH_FAILED', message: error.message });
  }
});

// POST /api/auth/logout
router.post('/logout', async (req: Request, res: Response) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return res.status(400).json({ error: 'TOKEN_REQUIRED' });
    }

    const success = await authService.logout(token);

    if (!success) {
      return res.status(404).json({ error: 'SESSION_NOT_FOUND' });
    }

    res.json({ message: 'LOGGED_OUT' });
  } catch (error: any) {
    res.status(500).json({ error: 'LOGOUT_FAILED', message: error.message });
  }
});

// GET /api/auth/me - get current user info
router.get('/me', async (req: Request, res: Response) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({ error: 'TOKEN_REQUIRED' });
    }

    const user = await authService.validateToken(token);

    if (!user) {
      return res.status(401).json({ error: 'INVALID_OR_EXPIRED_TOKEN' });
    }

    const safeUser = {
      id: user.id,
      username: user.username,
      role: user.role,
      permissions: user.permissions
    };

    res.json({ user: safeUser });
  } catch (error: any) {
    res.status(500).json({ error: 'AUTH_CHECK_FAILED', message: error.message });
  }
});

export { router as authRouter };
