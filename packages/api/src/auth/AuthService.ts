import { createHash, randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import pino from 'pino';

const logger = pino();

export type UserRole = 'ADMIN' | 'ENGINEER' | 'VIEWER';

export interface User {
  id: string;
  username: string;
  passwordHash: string;
  role: UserRole;
  permissions: string[];
  createdAt: string;
}

export interface Session {
  id: string;
  userId: string;
  token: string;
  refreshToken: string;
  expiresAt: string;
  refreshExpiresAt: string;
  createdAt: string;
}

const USERS_FILE = path.join(process.cwd(), '.runtime', 'users.json');
const SESSIONS_FILE = path.join(process.cwd(), '.runtime', 'sessions.json');

function ensureRuntimeDir() {
  const dir = path.dirname(USERS_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function loadUsers(): Map<string, User> {
  try {
    if (!fs.existsSync(USERS_FILE)) {
      // Initialize with default users for development
      const defaultUsers: User[] = [
        {
          id: 'user-admin-001',
          username: 'admin',
          passwordHash: hashPassword('admin123'),
          role: 'ADMIN',
          permissions: ['*'],
          createdAt: new Date().toISOString()
        },
        {
          id: 'user-eng-001',
          username: 'engineer',
          passwordHash: hashPassword('engineer123'),
          role: 'ENGINEER',
          permissions: ['jobs:create', 'jobs:read', 'tools:engineering', 'artifacts:generate'],
          createdAt: new Date().toISOString()
        },
        {
          id: 'user-view-001',
          username: 'viewer',
          passwordHash: hashPassword('viewer123'),
          role: 'VIEWER',
          permissions: ['jobs:read'],
          createdAt: new Date().toISOString()
        }
      ];
      saveUsers(defaultUsers);
      return new Map(defaultUsers.map(u => [u.id, u]));
    }
    const raw = fs.readFileSync(USERS_FILE, 'utf8');
    const parsed = JSON.parse(raw) as User[];
    return new Map(parsed.map(u => [u.id, u]));
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to load users');
    return new Map();
  }
}

function saveUsers(users: User[]) {
  ensureRuntimeDir();
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
}

function loadSessions(): Map<string, Session> {
  try {
    if (!fs.existsSync(SESSIONS_FILE)) {
      return new Map();
    }
    const raw = fs.readFileSync(SESSIONS_FILE, 'utf8');
    const parsed = JSON.parse(raw) as Session[];
    return new Map(parsed.map(s => [s.id, s]));
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to load sessions');
    return new Map();
  }
}

function saveSessions(sessions: Session[]) {
  ensureRuntimeDir();
  fs.writeFileSync(SESSIONS_FILE, JSON.stringify(sessions, null, 2), 'utf8');
}

function hashPassword(password: string): string {
  return createHash('sha256').update(password).digest('hex');
}

function generateToken(): string {
  return randomUUID().replace(/-/g, '');
}

export class AuthService {
  private users: Map<string, User>;
  private sessions: Map<string, Session>;

  constructor() {
    this.users = loadUsers();
    this.sessions = loadSessions();
    
    // Clean expired sessions on startup
    this.cleanExpiredSessions();
  }

  private cleanExpiredSessions() {
    const now = new Date();
    const validSessions: Session[] = [];
    
    for (const session of this.sessions.values()) {
      if (new Date(session.refreshExpiresAt) > now) {
        validSessions.push(session);
      }
    }
    
    if (validSessions.length !== this.sessions.size) {
      this.sessions = new Map(validSessions.map(s => [s.id, s]));
      saveSessions(validSessions);
      logger.info({ cleaned: this.sessions.size }, 'Cleaned expired sessions');
    }
  }

  async login(username: string, password: string): Promise<{ user: User; session: Session } | null> {
    const passwordHash = hashPassword(password);
    
    let foundUser: User | undefined;
    for (const user of this.users.values()) {
      if (user.username === username && user.passwordHash === passwordHash) {
        foundUser = user;
        break;
      }
    }

    if (!foundUser) {
      logger.warn({ username }, 'Login failed: invalid credentials');
      return null;
    }

    // Create new session
    const session: Session = {
      id: randomUUID(),
      userId: foundUser.id,
      token: generateToken(),
      refreshToken: generateToken(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours
      refreshExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
      createdAt: new Date().toISOString()
    };

    this.sessions.set(session.id, session);
    saveSessions(Array.from(this.sessions.values()));

    logger.info({ userId: foundUser.id, username }, 'User logged in');
    return { user: foundUser, session };
  }

  async refreshToken(refreshToken: string): Promise<Session | null> {
    let foundSession: Session | undefined;
    for (const session of this.sessions.values()) {
      if (session.refreshToken === refreshToken) {
        foundSession = session;
        break;
      }
    }

    if (!foundSession) {
      logger.warn({ refreshToken }, 'Refresh failed: invalid refresh token');
      return null;
    }

    if (new Date(foundSession.refreshExpiresAt) <= new Date()) {
      logger.warn({ sessionId: foundSession.id }, 'Refresh failed: refresh token expired');
      this.sessions.delete(foundSession.id);
      saveSessions(Array.from(this.sessions.values()));
      return null;
    }

    // Issue new tokens
    const newSession: Session = {
      ...foundSession,
      token: generateToken(),
      refreshToken: generateToken(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      createdAt: new Date().toISOString()
    };

    this.sessions.set(newSession.id, newSession);
    saveSessions(Array.from(this.sessions.values()));

    logger.info({ userId: foundSession.userId }, 'Token refreshed');
    return newSession;
  }

  async validateToken(token: string): Promise<User | null> {
    let foundSession: Session | undefined;
    for (const session of this.sessions.values()) {
      if (session.token === token) {
        foundSession = session;
        break;
      }
    }

    if (!foundSession) {
      return null;
    }

    if (new Date(foundSession.expiresAt) <= new Date()) {
      logger.warn({ sessionId: foundSession.id }, 'Token validation failed: token expired');
      return null;
    }

    const user = this.users.get(foundSession.userId);
    return user || null;
  }

  async logout(token: string): Promise<boolean> {
    let foundSession: Session | undefined;
    for (const session of this.sessions.values()) {
      if (session.token === token) {
        foundSession = session;
        break;
      }
    }

    if (!foundSession) {
      return false;
    }

    this.sessions.delete(foundSession.id);
    saveSessions(Array.from(this.sessions.values()));
    logger.info({ sessionId: foundSession.id }, 'User logged out');
    return true;
  }

  getUserById(userId: string): User | undefined {
    return this.users.get(userId);
  }

  hasPermission(user: User, permission: string): boolean {
    if (user.permissions.includes('*')) {
      return true;
    }
    return user.permissions.includes(permission);
  }
}

// Export singleton instance
export const authService = new AuthService();
