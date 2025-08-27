/**
 * Authentication and Authorization Service
 * Handles user session validation, token management, and fail-fast security checks
 */

/**
 * User session information
 */
export interface UserSession {
  /** Unique user identifier */
  userId: string;
  /** User display name */
  username: string;
  /** User email address */
  email: string;
  /** User roles for authorization */
  roles: string[];
  /** Session token */
  token: string;
  /** Token expiration timestamp */
  expiresAt: number;
  /** Session creation timestamp */
  createdAt: number;
  /** Last activity timestamp */
  lastActivity: number;
}

/**
 * Authentication configuration options
 */
export interface AuthOptions {
  /** API base URL for authentication endpoints */
  authBaseUrl?: string;
  /** Token header name (defaults to 'Authorization') */
  tokenHeader?: string;
  /** Token prefix (defaults to 'Bearer') */
  tokenPrefix?: string;
  /** Session timeout in milliseconds */
  sessionTimeoutMs?: number;
  /** Enable automatic token refresh */
  autoRefresh?: boolean;
  /** Required roles for API access */
  requiredRoles?: string[];
}

/**
 * Authentication error types
 */
export class AuthenticationError extends Error {
  public readonly code: string;
  public readonly correlationId?: string;

  constructor(message: string, code: string, correlationId?: string) {
    super(message);
    this.name = "AuthenticationError";
    this.code = code;
    this.correlationId = correlationId;
  }
}

export class AuthorizationError extends Error {
  public readonly code: string;
  public readonly requiredRoles: string[];
  public readonly userRoles: string[];
  public readonly correlationId?: string;

  constructor(
    message: string,
    code: string,
    requiredRoles: string[],
    userRoles: string[],
    correlationId?: string
  ) {
    super(message);
    this.name = "AuthorizationError";
    this.code = code;
    this.requiredRoles = requiredRoles;
    this.userRoles = userRoles;
    this.correlationId = correlationId;
  }
}

/**
 * Authentication and Authorization Service
 */
export class AuthService {
  private session: UserSession | null = null;
  private readonly options: Required<AuthOptions>;

  constructor(options: AuthOptions = {}) {
    this.options = {
      authBaseUrl: "https://auth.api.example.com",
      tokenHeader: "Authorization",
      tokenPrefix: "Bearer",
      sessionTimeoutMs: 30 * 60 * 1000, // 30 minutes
      autoRefresh: true,
      requiredRoles: ["user"],
      ...options,
    };
  }

  /**
   * Authenticate user with credentials (simulated for demo)
   */
  async authenticate(
    username: string,
    password: string,
    correlationId?: string
  ): Promise<UserSession> {
    const id = correlationId || "auth";
    console.log(`[${id}] Authenticating user: ${username}`);

    // Simulate authentication API call
    if (username === "admin" && password === "admin123") {
      this.session = {
        userId: "user-001",
        username: "admin",
        email: "admin@example.com",
        roles: ["admin", "user"],
        token: this.generateToken(),
        expiresAt: Date.now() + this.options.sessionTimeoutMs,
        createdAt: Date.now(),
        lastActivity: Date.now(),
      };
      console.log(`[${id}] ✅ Authentication successful for admin user`);
    } else if (username === "user" && password === "user123") {
      this.session = {
        userId: "user-002",
        username: "user",
        email: "user@example.com",
        roles: ["user"],
        token: this.generateToken(),
        expiresAt: Date.now() + this.options.sessionTimeoutMs,
        createdAt: Date.now(),
        lastActivity: Date.now(),
      };
      console.log(`[${id}] ✅ Authentication successful for regular user`);
    } else {
      console.error(`[${id}] ❌ Authentication failed for user: ${username}`);
      throw new AuthenticationError(
        "Invalid username or password",
        "INVALID_CREDENTIALS",
        id
      );
    }

    return this.session;
  }

  /**
   * Validate current session with fail-fast checks
   */
  validateSession(correlationId?: string): UserSession {
    const id = correlationId || "auth";

    // Fail-fast check: No session exists
    if (!this.session) {
      console.error(`[${id}] ❌ No active session found`);
      throw new AuthenticationError(
        "No active session. Please authenticate first.",
        "NO_SESSION",
        id
      );
    }

    // Fail-fast check: Session expired
    if (Date.now() > this.session.expiresAt) {
      console.error(
        `[${id}] ❌ Session expired at ${new Date(
          this.session.expiresAt
        ).toISOString()}`
      );
      this.session = null;
      throw new AuthenticationError(
        "Session has expired. Please authenticate again.",
        "SESSION_EXPIRED",
        id
      );
    }

    // Fail-fast check: Session timeout due to inactivity
    const inactiveTime = Date.now() - this.session.lastActivity;
    if (inactiveTime > this.options.sessionTimeoutMs) {
      console.error(
        `[${id}] ❌ Session timed out due to inactivity (${inactiveTime}ms)`
      );
      this.session = null;
      throw new AuthenticationError(
        "Session timed out due to inactivity. Please authenticate again.",
        "SESSION_TIMEOUT",
        id
      );
    }

    // Update last activity
    this.session.lastActivity = Date.now();
    console.log(
      `[${id}] ✅ Session validation successful for user: ${this.session.username}`
    );

    return this.session;
  }

  /**
   * Check user authorization for required roles
   */
  checkAuthorization(
    requiredRoles: string[] = this.options.requiredRoles,
    correlationId?: string
  ): void {
    const id = correlationId || "auth";
    const session = this.validateSession(id);

    // Check if user has any of the required roles
    const hasRequiredRole = requiredRoles.some((role) =>
      session.roles.includes(role)
    );

    if (!hasRequiredRole) {
      console.error(
        `[${id}] ❌ Authorization failed. Required: [${requiredRoles.join(
          ", "
        )}], User has: [${session.roles.join(", ")}]`
      );
      throw new AuthorizationError(
        `Insufficient permissions. Required roles: ${requiredRoles.join(", ")}`,
        "INSUFFICIENT_PERMISSIONS",
        requiredRoles,
        session.roles,
        id
      );
    }

    console.log(
      `[${id}] ✅ Authorization successful. User roles: [${session.roles.join(
        ", "
      )}]`
    );
  }

  /**
   * Get authentication headers for API requests
   */
  getAuthHeaders(correlationId?: string): Record<string, string> {
    const session = this.validateSession(correlationId);

    return {
      [this.options
        .tokenHeader]: `${this.options.tokenPrefix} ${session.token}`,
      "X-User-ID": session.userId,
      "X-Username": session.username,
    };
  }

  /**
   * Get current session information
   */
  getCurrentSession(): UserSession | null {
    return this.session;
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    try {
      this.validateSession();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if user has specific role
   */
  hasRole(role: string): boolean {
    try {
      const session = this.validateSession();
      return session.roles.includes(role);
    } catch {
      return false;
    }
  }

  /**
   * Logout and clear session
   */
  logout(correlationId?: string): void {
    const id = correlationId || "auth";
    if (this.session) {
      console.log(`[${id}] Logging out user: ${this.session.username}`);
      this.session = null;
      console.log(`[${id}] ✅ Logout successful`);
    } else {
      console.log(`[${id}] No active session to logout`);
    }
  }

  /**
   * Refresh session token (simulated)
   */
  async refreshToken(correlationId?: string): Promise<UserSession> {
    const id = correlationId || "auth";
    const session = this.validateSession(id);

    console.log(`[${id}] Refreshing token for user: ${session.username}`);

    // Simulate token refresh
    session.token = this.generateToken();
    session.expiresAt = Date.now() + this.options.sessionTimeoutMs;
    session.lastActivity = Date.now();

    console.log(`[${id}] ✅ Token refreshed successfully`);
    return session;
  }

  /**
   * Get session status information
   */
  getSessionStatus(): {
    isAuthenticated: boolean;
    username?: string;
    roles?: string[];
    expiresAt?: number;
    timeRemaining?: number;
  } {
    if (!this.session) {
      return { isAuthenticated: false };
    }

    try {
      this.validateSession();
      return {
        isAuthenticated: true,
        username: this.session.username,
        roles: this.session.roles,
        expiresAt: this.session.expiresAt,
        timeRemaining: this.session.expiresAt - Date.now(),
      };
    } catch {
      return { isAuthenticated: false };
    }
  }

  /**
   * Generate a mock JWT token for demo purposes
   */
  private generateToken(): string {
    const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
    const payload = btoa(
      JSON.stringify({
        sub: this.session?.userId || "unknown",
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor((Date.now() + this.options.sessionTimeoutMs) / 1000),
      })
    );
    const signature = btoa("mock-signature-" + Date.now());

    return `${header}.${payload}.${signature}`;
  }
}

/**
 * Factory for creating common authentication configurations
 */
export class AuthServiceFactory {
  /**
   * Create development auth service with relaxed security
   */
  static createDevelopment(): AuthService {
    return new AuthService({
      sessionTimeoutMs: 60 * 60 * 1000, // 1 hour
      autoRefresh: true,
      requiredRoles: ["user"],
    });
  }

  /**
   * Create production auth service with strict security
   */
  static createProduction(): AuthService {
    return new AuthService({
      sessionTimeoutMs: 15 * 60 * 1000, // 15 minutes
      autoRefresh: false,
      requiredRoles: ["user", "verified"],
    });
  }

  /**
   * Create admin-only auth service
   */
  static createAdminOnly(): AuthService {
    return new AuthService({
      sessionTimeoutMs: 30 * 60 * 1000, // 30 minutes
      autoRefresh: true,
      requiredRoles: ["admin"],
    });
  }
}
