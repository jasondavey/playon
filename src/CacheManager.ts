/**
 * Advanced Request/Response Caching System
 * Supports TTL, LRU eviction, cache invalidation, and performance monitoring
 */

export enum CacheStrategy {
  TTL = "TTL", // Time-to-live based caching
  LRU = "LRU", // Least Recently Used eviction
  WRITE_THROUGH = "WRITE_THROUGH", // Write to cache and storage simultaneously
  WRITE_BEHIND = "WRITE_BEHIND", // Write to cache first, storage later
  READ_THROUGH = "READ_THROUGH", // Read from cache, fallback to source
}

export interface CacheConfig {
  /** Maximum number of entries in cache */
  maxSize: number;
  /** Default TTL in milliseconds */
  defaultTtl: number;
  /** Cache strategy to use */
  strategy: CacheStrategy;
  /** Enable cache metrics collection */
  enableMetrics: boolean;
  /** Cache cleanup interval in milliseconds */
  cleanupInterval: number;
  /** Enable cache compression for large values */
  enableCompression?: boolean;
  /** Maximum size per cache entry in bytes */
  maxEntrySize?: number;
}

export interface CacheEntry<T> {
  /** Cached value */
  value: T;
  /** Timestamp when entry was created */
  createdAt: number;
  /** Timestamp when entry expires */
  expiresAt: number;
  /** Timestamp of last access */
  lastAccessed: number;
  /** Number of times this entry has been accessed */
  accessCount: number;
  /** Size of the entry in bytes */
  size: number;
  /** Cache key */
  key: string;
  /** Tags for cache invalidation */
  tags: string[];
}

export interface CacheMetrics {
  /** Total cache hits */
  hits: number;
  /** Total cache misses */
  misses: number;
  /** Cache hit ratio (0-1) */
  hitRatio: number;
  /** Total entries in cache */
  size: number;
  /** Total memory usage in bytes */
  memoryUsage: number;
  /** Number of evictions */
  evictions: number;
  /** Number of expirations */
  expirations: number;
  /** Average response time for cache operations */
  avgResponseTime: number;
  /** Cache uptime in milliseconds */
  uptime: number;
}

export interface CacheOptions {
  /** Time-to-live for this specific entry */
  ttl?: number;
  /** Tags for cache invalidation */
  tags?: string[];
  /** Whether to refresh TTL on access */
  refreshOnAccess?: boolean;
  /** Custom serialization function */
  serialize?: (value: any) => string;
  /** Custom deserialization function */
  deserialize?: (value: string) => any;
}

/**
 * Advanced cache manager with multiple strategies and monitoring
 */
export class CacheManager<T = any> {
  private cache = new Map<string, CacheEntry<T>>();
  private accessOrder: string[] = []; // For LRU tracking
  private metrics: CacheMetrics;
  private cleanupTimer?: NodeJS.Timeout;
  private readonly startTime = Date.now();

  constructor(
    private readonly name: string,
    private readonly config: CacheConfig
  ) {
    this.metrics = {
      hits: 0,
      misses: 0,
      hitRatio: 0,
      size: 0,
      memoryUsage: 0,
      evictions: 0,
      expirations: 0,
      avgResponseTime: 0,
      uptime: 0,
    };

    this.startCleanupTimer();
    this.validateConfig();
  }

  /**
   * Get value from cache
   */
  async get(key: string, correlationId?: string): Promise<T | null> {
    const startTime = Date.now();
    const id = correlationId || `cache-${Date.now()}`;

    try {
      const entry = this.cache.get(key);

      if (!entry) {
        this.recordMiss();
        console.log(`[${id}] Cache [${this.name}] MISS: ${key}`);
        return null;
      }

      // Check if entry has expired
      if (this.isExpired(entry)) {
        this.cache.delete(key);
        this.removeFromAccessOrder(key);
        this.metrics.expirations++;
        this.recordMiss();
        console.log(`[${id}] Cache [${this.name}] EXPIRED: ${key}`);
        return null;
      }

      // Update access tracking
      entry.lastAccessed = Date.now();
      entry.accessCount++;

      if (this.config.strategy === CacheStrategy.LRU) {
        this.updateAccessOrder(key);
      }

      this.recordHit();
      console.log(
        `[${id}] Cache [${this.name}] HIT: ${key} (age: ${
          Date.now() - entry.createdAt
        }ms)`
      );

      return entry.value;
    } finally {
      this.updateResponseTime(Date.now() - startTime);
    }
  }

  /**
   * Set value in cache
   */
  async set(
    key: string,
    value: T,
    options: CacheOptions = {},
    correlationId?: string
  ): Promise<void> {
    const startTime = Date.now();
    const id = correlationId || `cache-${Date.now()}`;

    try {
      const now = Date.now();
      const ttl = options.ttl || this.config.defaultTtl;
      const size = this.calculateSize(value);

      // Check if entry exceeds max size
      if (this.config.maxEntrySize && size > this.config.maxEntrySize) {
        console.warn(
          `[${id}] Cache [${this.name}] Entry too large: ${key} (${size} bytes)`
        );
        return;
      }

      // Ensure we have space in cache
      await this.ensureSpace(size);

      const entry: CacheEntry<T> = {
        value,
        createdAt: now,
        expiresAt: now + ttl,
        lastAccessed: now,
        accessCount: 0,
        size,
        key,
        tags: options.tags || [],
      };

      this.cache.set(key, entry);

      if (this.config.strategy === CacheStrategy.LRU) {
        this.updateAccessOrder(key);
      }

      this.updateMetrics();
      console.log(
        `[${id}] Cache [${this.name}] SET: ${key} (TTL: ${ttl}ms, Size: ${size} bytes)`
      );
    } finally {
      this.updateResponseTime(Date.now() - startTime);
    }
  }

  /**
   * Delete specific key from cache
   */
  async delete(key: string, correlationId?: string): Promise<boolean> {
    const id = correlationId || `cache-${Date.now()}`;

    if (this.cache.has(key)) {
      this.cache.delete(key);
      this.removeFromAccessOrder(key);
      this.updateMetrics();
      console.log(`[${id}] Cache [${this.name}] DELETE: ${key}`);
      return true;
    }

    return false;
  }

  /**
   * Invalidate cache entries by tags
   */
  async invalidateByTags(
    tags: string[],
    correlationId?: string
  ): Promise<number> {
    const id = correlationId || `cache-${Date.now()}`;
    let invalidated = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.tags.some((tag) => tags.includes(tag))) {
        this.cache.delete(key);
        this.removeFromAccessOrder(key);
        invalidated++;
      }
    }

    this.updateMetrics();
    console.log(
      `[${id}] Cache [${
        this.name
      }] INVALIDATED ${invalidated} entries by tags: [${tags.join(", ")}]`
    );

    return invalidated;
  }

  /**
   * Clear all cache entries
   */
  async clear(correlationId?: string): Promise<void> {
    const id = correlationId || `cache-${Date.now()}`;
    const size = this.cache.size;

    this.cache.clear();
    this.accessOrder.length = 0;
    this.updateMetrics();

    console.log(
      `[${id}] Cache [${this.name}] CLEARED: ${size} entries removed`
    );
  }

  /**
   * Get cache statistics
   */
  getMetrics(): CacheMetrics {
    this.metrics.uptime = Date.now() - this.startTime;
    this.metrics.hitRatio =
      this.metrics.hits + this.metrics.misses > 0
        ? this.metrics.hits / (this.metrics.hits + this.metrics.misses)
        : 0;

    return { ...this.metrics };
  }

  /**
   * Get cache keys matching pattern
   */
  getKeys(pattern?: RegExp): string[] {
    const keys = Array.from(this.cache.keys());
    return pattern ? keys.filter((key) => pattern.test(key)) : keys;
  }

  /**
   * Check if cache has key
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    return entry ? !this.isExpired(entry) : false;
  }

  /**
   * Get cache entry info without accessing the value
   */
  getEntryInfo(key: string): Partial<CacheEntry<T>> | null {
    const entry = this.cache.get(key);
    if (!entry || this.isExpired(entry)) {
      return null;
    }

    return {
      createdAt: entry.createdAt,
      expiresAt: entry.expiresAt,
      lastAccessed: entry.lastAccessed,
      accessCount: entry.accessCount,
      size: entry.size,
      key: entry.key,
      tags: [...entry.tags],
    };
  }

  /**
   * Cleanup expired entries manually
   */
  async cleanup(correlationId?: string): Promise<number> {
    const id = correlationId || `cache-${Date.now()}`;
    let cleaned = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (this.isExpired(entry)) {
        this.cache.delete(key);
        this.removeFromAccessOrder(key);
        cleaned++;
        this.metrics.expirations++;
      }
    }

    this.updateMetrics();

    if (cleaned > 0) {
      console.log(
        `[${id}] Cache [${this.name}] CLEANUP: ${cleaned} expired entries removed`
      );
    }

    return cleaned;
  }

  /**
   * Destroy cache and cleanup resources
   */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
    this.cache.clear();
    this.accessOrder.length = 0;
    console.log(`Cache [${this.name}] DESTROYED`);
  }

  /**
   * Check if entry has expired
   */
  private isExpired(entry: CacheEntry<T>): boolean {
    return Date.now() > entry.expiresAt;
  }

  /**
   * Ensure cache has space for new entry
   */
  private async ensureSpace(requiredSize: number): Promise<void> {
    // Remove expired entries first
    await this.cleanup();

    // If still over capacity, use eviction strategy
    while (this.cache.size >= this.config.maxSize) {
      this.evictEntry();
    }
  }

  /**
   * Evict entry based on strategy
   */
  private evictEntry(): void {
    let keyToEvict: string | undefined;

    switch (this.config.strategy) {
      case CacheStrategy.LRU:
        keyToEvict = this.accessOrder[0]; // Least recently used
        break;

      default:
        // Default to oldest entry
        let oldestTime = Infinity;
        for (const [key, entry] of this.cache.entries()) {
          if (entry.createdAt < oldestTime) {
            oldestTime = entry.createdAt;
            keyToEvict = key;
          }
        }
    }

    if (keyToEvict) {
      this.cache.delete(keyToEvict);
      this.removeFromAccessOrder(keyToEvict);
      this.metrics.evictions++;
      console.log(`Cache [${this.name}] EVICTED: ${keyToEvict}`);
    }
  }

  /**
   * Update LRU access order
   */
  private updateAccessOrder(key: string): void {
    this.removeFromAccessOrder(key);
    this.accessOrder.push(key);
  }

  /**
   * Remove key from access order tracking
   */
  private removeFromAccessOrder(key: string): void {
    const index = this.accessOrder.indexOf(key);
    if (index > -1) {
      this.accessOrder.splice(index, 1);
    }
  }

  /**
   * Calculate approximate size of value in bytes
   */
  private calculateSize(value: T): number {
    try {
      return new TextEncoder().encode(JSON.stringify(value)).length;
    } catch {
      return 1024; // Default size if serialization fails
    }
  }

  /**
   * Record cache hit
   */
  private recordHit(): void {
    this.metrics.hits++;
  }

  /**
   * Record cache miss
   */
  private recordMiss(): void {
    this.metrics.misses++;
  }

  /**
   * Update response time metrics
   */
  private updateResponseTime(responseTime: number): void {
    const totalOps = this.metrics.hits + this.metrics.misses;
    this.metrics.avgResponseTime =
      totalOps > 0
        ? (this.metrics.avgResponseTime * (totalOps - 1) + responseTime) /
          totalOps
        : responseTime;
  }

  /**
   * Update cache metrics
   */
  private updateMetrics(): void {
    this.metrics.size = this.cache.size;
    this.metrics.memoryUsage = Array.from(this.cache.values()).reduce(
      (total, entry) => total + entry.size,
      0
    );
  }

  /**
   * Start cleanup timer
   */
  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, this.config.cleanupInterval);
  }

  /**
   * Validate configuration
   */
  private validateConfig(): void {
    if (this.config.maxSize <= 0) {
      throw new Error("Cache maxSize must be greater than 0");
    }
    if (this.config.defaultTtl <= 0) {
      throw new Error("Cache defaultTtl must be greater than 0");
    }
    if (this.config.cleanupInterval <= 0) {
      throw new Error("Cache cleanupInterval must be greater than 0");
    }
  }
}

/**
 * Factory for creating cache managers with common configurations
 */
export class CacheFactory {
  /**
   * Create a cache for API responses
   */
  static createApiCache<T>(name: string): CacheManager<T> {
    return new CacheManager(name, {
      maxSize: 1000,
      defaultTtl: 5 * 60 * 1000, // 5 minutes
      strategy: CacheStrategy.LRU,
      enableMetrics: true,
      cleanupInterval: 60 * 1000, // 1 minute
      maxEntrySize: 1024 * 1024, // 1MB
    });
  }

  /**
   * Create a cache for user sessions
   */
  static createSessionCache<T>(name: string): CacheManager<T> {
    return new CacheManager(name, {
      maxSize: 10000,
      defaultTtl: 30 * 60 * 1000, // 30 minutes
      strategy: CacheStrategy.TTL,
      enableMetrics: true,
      cleanupInterval: 5 * 60 * 1000, // 5 minutes
      maxEntrySize: 10 * 1024, // 10KB
    });
  }

  /**
   * Create a cache for static data
   */
  static createStaticCache<T>(name: string): CacheManager<T> {
    return new CacheManager(name, {
      maxSize: 500,
      defaultTtl: 60 * 60 * 1000, // 1 hour
      strategy: CacheStrategy.LRU,
      enableMetrics: true,
      cleanupInterval: 10 * 60 * 1000, // 10 minutes
      maxEntrySize: 5 * 1024 * 1024, // 5MB
    });
  }

  /**
   * Create a high-performance cache for frequent access
   */
  static createHighPerformanceCache<T>(name: string): CacheManager<T> {
    return new CacheManager(name, {
      maxSize: 5000,
      defaultTtl: 2 * 60 * 1000, // 2 minutes
      strategy: CacheStrategy.LRU,
      enableMetrics: true,
      cleanupInterval: 30 * 1000, // 30 seconds
      maxEntrySize: 512 * 1024, // 512KB
    });
  }
}
