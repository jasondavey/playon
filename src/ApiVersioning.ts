/**
 * API Versioning Service
 * Handles version negotiation, URL structure, and backward compatibility
 */

/**
 * Supported API versions
 */
export enum ApiVersion {
  V1 = "v1",
  V2 = "v2",
  V3 = "v3",
}

/**
 * Version negotiation strategy
 */
export enum VersionStrategy {
  /** Version in URL path: /api/v1/users */
  URL_PATH = "url_path",
  /** Version in Accept header: Accept: application/vnd.api+json;version=1 */
  ACCEPT_HEADER = "accept_header",
  /** Version in custom header: API-Version: v1 */
  CUSTOM_HEADER = "custom_header",
  /** Version in query parameter: /users?version=v1 */
  QUERY_PARAM = "query_param",
}

/**
 * Version configuration
 */
export interface VersionConfig {
  /** Current version */
  version: ApiVersion;
  /** Version negotiation strategy */
  strategy: VersionStrategy;
  /** Default version when none specified */
  defaultVersion: ApiVersion;
  /** Deprecated versions with sunset dates */
  deprecatedVersions: Map<ApiVersion, Date>;
  /** Supported versions */
  supportedVersions: ApiVersion[];
  /** Base API path */
  basePath: string;
}

/**
 * Version-aware request context
 */
export interface VersionedRequest {
  /** Resolved API version */
  version: ApiVersion;
  /** Full versioned URL */
  url: string;
  /** Version-specific headers */
  headers: Record<string, string>;
  /** Deprecation warnings */
  warnings: string[];
  /** Whether version is deprecated */
  isDeprecated: boolean;
  /** Migration information */
  migrationInfo?: {
    recommendedVersion: ApiVersion;
    migrationGuide: string;
    sunsetDate?: Date;
  };
}

/**
 * Version-specific response transformations
 */
export interface VersionTransformer {
  /** Transform response for specific version */
  transformResponse<T>(
    data: T,
    fromVersion: ApiVersion,
    toVersion: ApiVersion
  ): T;
  /** Transform request for specific version */
  transformRequest<T>(
    data: T,
    fromVersion: ApiVersion,
    toVersion: ApiVersion
  ): T;
}

/**
 * API Versioning Service
 */
export class ApiVersioningService {
  private config: VersionConfig;
  private transformers: Map<string, VersionTransformer> = new Map();

  constructor(config: Partial<VersionConfig> = {}) {
    this.config = {
      version: ApiVersion.V1,
      strategy: VersionStrategy.URL_PATH,
      defaultVersion: ApiVersion.V1,
      deprecatedVersions: new Map([
        // Example: V1 deprecated, sunset in 6 months
        [ApiVersion.V1, new Date(Date.now() + 6 * 30 * 24 * 60 * 60 * 1000)],
      ]),
      supportedVersions: [ApiVersion.V1, ApiVersion.V2, ApiVersion.V3],
      basePath: "/api",
      ...config,
    };
  }

  /**
   * Register version transformer for specific endpoint
   */
  registerTransformer(endpoint: string, transformer: VersionTransformer): void {
    this.transformers.set(endpoint, transformer);
  }

  /**
   * Negotiate API version from request
   */
  negotiateVersion(
    url: string,
    headers: Record<string, string> = {},
    queryParams: Record<string, string> = {}
  ): VersionedRequest {
    let resolvedVersion = this.config.defaultVersion;
    const warnings: string[] = [];

    // Extract version based on strategy
    switch (this.config.strategy) {
      case VersionStrategy.URL_PATH:
        resolvedVersion =
          this.extractVersionFromUrl(url) || this.config.defaultVersion;
        break;

      case VersionStrategy.ACCEPT_HEADER:
        resolvedVersion =
          this.extractVersionFromAcceptHeader(
            headers.accept || headers.Accept
          ) || this.config.defaultVersion;
        break;

      case VersionStrategy.CUSTOM_HEADER:
        resolvedVersion =
          this.extractVersionFromCustomHeader(
            headers["api-version"] || headers["API-Version"]
          ) || this.config.defaultVersion;
        break;

      case VersionStrategy.QUERY_PARAM:
        resolvedVersion =
          this.extractVersionFromQuery(queryParams.version) ||
          this.config.defaultVersion;
        break;
    }

    // Validate version is supported
    if (!this.config.supportedVersions.includes(resolvedVersion)) {
      warnings.push(
        `Unsupported API version '${resolvedVersion}'. Falling back to '${this.config.defaultVersion}'.`
      );
      resolvedVersion = this.config.defaultVersion;
    }

    // Check for deprecation
    const isDeprecated = this.config.deprecatedVersions.has(resolvedVersion);
    const sunsetDate = this.config.deprecatedVersions.get(resolvedVersion);

    if (isDeprecated && sunsetDate) {
      warnings.push(
        `API version '${resolvedVersion}' is deprecated and will be sunset on ${
          sunsetDate.toISOString().split("T")[0]
        }.`
      );
    }

    // Build versioned URL
    const versionedUrl = this.buildVersionedUrl(url, resolvedVersion);

    // Build version-specific headers
    const versionHeaders = this.buildVersionHeaders(resolvedVersion, warnings);

    // Migration information
    const migrationInfo = isDeprecated
      ? {
          recommendedVersion: this.getRecommendedVersion(resolvedVersion),
          migrationGuide: this.getMigrationGuide(resolvedVersion),
          sunsetDate,
        }
      : undefined;

    return {
      version: resolvedVersion,
      url: versionedUrl,
      headers: versionHeaders,
      warnings,
      isDeprecated,
      migrationInfo,
    };
  }

  /**
   * Build versioned URL based on strategy
   */
  buildVersionedUrl(originalUrl: string, version: ApiVersion): string {
    if (this.config.strategy === VersionStrategy.URL_PATH) {
      // Convert /users to /api/v1/users
      const path = originalUrl.replace(/^https?:\/\/[^\/]+/, ""); // Remove domain
      const cleanPath = path.startsWith("/") ? path.slice(1) : path;
      return originalUrl.replace(
        path,
        `${this.config.basePath}/${version}/${cleanPath}`
      );
    }

    return originalUrl; // Other strategies don't modify URL
  }

  /**
   * Build version-specific headers
   */
  buildVersionHeaders(
    version: ApiVersion,
    warnings: string[]
  ): Record<string, string> {
    const headers: Record<string, string> = {};

    // Always include version in response headers
    headers["API-Version"] = version;
    headers["Supported-Versions"] = this.config.supportedVersions.join(", ");

    // Add deprecation warnings
    if (warnings.length > 0) {
      headers["Warning"] = warnings.map((w, i) => `299 - "${w}"`).join(", ");
      headers["Deprecation"] = "true";
    }

    // Add sunset header for deprecated versions
    const sunsetDate = this.config.deprecatedVersions.get(version);
    if (sunsetDate) {
      headers["Sunset"] = sunsetDate.toUTCString();
    }

    return headers;
  }

  /**
   * Transform response data for version compatibility
   */
  transformResponse<T>(
    data: T,
    endpoint: string,
    targetVersion: ApiVersion,
    sourceVersion: ApiVersion = this.config.version
  ): T {
    const transformer = this.transformers.get(endpoint);
    if (transformer && targetVersion !== sourceVersion) {
      return transformer.transformResponse(data, sourceVersion, targetVersion);
    }
    return data;
  }

  /**
   * Transform request data for version compatibility
   */
  transformRequest<T>(
    data: T,
    endpoint: string,
    sourceVersion: ApiVersion,
    targetVersion: ApiVersion = this.config.version
  ): T {
    const transformer = this.transformers.get(endpoint);
    if (transformer && sourceVersion !== targetVersion) {
      return transformer.transformRequest(data, sourceVersion, targetVersion);
    }
    return data;
  }

  /**
   * Get version compatibility matrix
   */
  getCompatibilityMatrix(): Record<
    ApiVersion,
    {
      compatible: ApiVersion[];
      breaking: ApiVersion[];
      deprecated: boolean;
      sunsetDate?: Date;
    }
  > {
    const matrix: any = {};

    for (const version of this.config.supportedVersions) {
      matrix[version] = {
        compatible: this.getCompatibleVersions(version),
        breaking: this.getBreakingVersions(version),
        deprecated: this.config.deprecatedVersions.has(version),
        sunsetDate: this.config.deprecatedVersions.get(version),
      };
    }

    return matrix;
  }

  /**
   * Extract version from URL path
   */
  private extractVersionFromUrl(url: string): ApiVersion | null {
    const match = url.match(/\/api\/(v\d+)\//);
    return match ? (match[1] as ApiVersion) : null;
  }

  /**
   * Extract version from Accept header
   */
  private extractVersionFromAcceptHeader(
    acceptHeader?: string
  ): ApiVersion | null {
    if (!acceptHeader) return null;
    const match = acceptHeader.match(/version=(\d+)/);
    return match ? (`v${match[1]}` as ApiVersion) : null;
  }

  /**
   * Extract version from custom header
   */
  private extractVersionFromCustomHeader(
    versionHeader?: string
  ): ApiVersion | null {
    if (!versionHeader) return null;
    return Object.values(ApiVersion).includes(versionHeader as ApiVersion)
      ? (versionHeader as ApiVersion)
      : null;
  }

  /**
   * Extract version from query parameter
   */
  private extractVersionFromQuery(versionParam?: string): ApiVersion | null {
    if (!versionParam) return null;
    return Object.values(ApiVersion).includes(versionParam as ApiVersion)
      ? (versionParam as ApiVersion)
      : null;
  }

  /**
   * Get recommended version for migration
   */
  private getRecommendedVersion(currentVersion: ApiVersion): ApiVersion {
    // Simple logic: recommend the latest supported version
    return this.config.supportedVersions[
      this.config.supportedVersions.length - 1
    ];
  }

  /**
   * Get migration guide URL
   */
  private getMigrationGuide(fromVersion: ApiVersion): string {
    return `https://docs.api.example.com/migration/${fromVersion}-to-${this.getRecommendedVersion(
      fromVersion
    )}`;
  }

  /**
   * Get compatible versions (backward compatible)
   */
  private getCompatibleVersions(version: ApiVersion): ApiVersion[] {
    // Simple logic: versions are backward compatible within major version
    const versionNum = parseInt(version.replace("v", ""));
    return this.config.supportedVersions.filter((v) => {
      const num = parseInt(v.replace("v", ""));
      return num >= versionNum; // Forward compatible
    });
  }

  /**
   * Get breaking versions (not compatible)
   */
  private getBreakingVersions(version: ApiVersion): ApiVersion[] {
    const compatible = this.getCompatibleVersions(version);
    return this.config.supportedVersions.filter((v) => !compatible.includes(v));
  }
}

/**
 * User entity transformer for version compatibility
 */
export class UserVersionTransformer implements VersionTransformer {
  transformResponse<T>(
    data: T,
    fromVersion: ApiVersion,
    toVersion: ApiVersion
  ): T {
    if (!data || typeof data !== "object") return data;

    // Example transformations between versions
    if (fromVersion === ApiVersion.V1 && toVersion === ApiVersion.V2) {
      return this.transformV1ToV2(data);
    }

    if (fromVersion === ApiVersion.V2 && toVersion === ApiVersion.V1) {
      return this.transformV2ToV1(data);
    }

    if (fromVersion === ApiVersion.V2 && toVersion === ApiVersion.V3) {
      return this.transformV2ToV3(data);
    }

    return data;
  }

  transformRequest<T>(
    data: T,
    fromVersion: ApiVersion,
    toVersion: ApiVersion
  ): T {
    // Similar logic for request transformations
    return this.transformResponse(data, fromVersion, toVersion);
  }

  private transformV1ToV2(data: any): any {
    if (Array.isArray(data)) {
      return data.map((item) => this.transformV1ToV2(item));
    }

    // V1 -> V2: Add metadata, restructure phone
    return {
      ...data,
      metadata: {
        version: "v2",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      contact: {
        email: data.email,
        phone: data.phone,
        website: data.website,
      },
      // Remove old fields
      email: undefined,
      phone: undefined,
      website: undefined,
    };
  }

  private transformV2ToV1(data: any): any {
    if (Array.isArray(data)) {
      return data.map((item) => this.transformV2ToV1(item));
    }

    // V2 -> V1: Flatten contact, remove metadata
    return {
      ...data,
      email: data.contact?.email || data.email,
      phone: data.contact?.phone || data.phone,
      website: data.contact?.website || data.website,
      contact: undefined,
      metadata: undefined,
    };
  }

  private transformV2ToV3(data: any): any {
    if (Array.isArray(data)) {
      return data.map((item) => this.transformV2ToV3(item));
    }

    // V2 -> V3: Add profile section, enhance metadata
    return {
      ...data,
      profile: {
        displayName: data.name,
        username: data.username,
        contact: data.contact,
        address: data.address,
        company: data.company,
      },
      metadata: {
        ...data.metadata,
        version: "v3",
        schema: "user-profile-v3",
      },
      // Remove old top-level fields
      name: undefined,
      username: undefined,
      contact: undefined,
      address: undefined,
      company: undefined,
    };
  }
}

/**
 * Factory for creating versioning services with common configurations
 */
export class ApiVersioningFactory {
  /**
   * Create URL path-based versioning (most common)
   */
  static createUrlPathVersioning(): ApiVersioningService {
    return new ApiVersioningService({
      strategy: VersionStrategy.URL_PATH,
      basePath: "/api",
      defaultVersion: ApiVersion.V2,
      supportedVersions: [ApiVersion.V1, ApiVersion.V2, ApiVersion.V3],
      deprecatedVersions: new Map([
        [ApiVersion.V1, new Date("2024-12-31")], // V1 sunset end of 2024
      ]),
    });
  }

  /**
   * Create header-based versioning
   */
  static createHeaderVersioning(): ApiVersioningService {
    return new ApiVersioningService({
      strategy: VersionStrategy.CUSTOM_HEADER,
      defaultVersion: ApiVersion.V2,
      supportedVersions: [ApiVersion.V1, ApiVersion.V2, ApiVersion.V3],
    });
  }

  /**
   * Create Accept header versioning (RESTful)
   */
  static createAcceptHeaderVersioning(): ApiVersioningService {
    return new ApiVersioningService({
      strategy: VersionStrategy.ACCEPT_HEADER,
      defaultVersion: ApiVersion.V2,
      supportedVersions: [ApiVersion.V1, ApiVersion.V2, ApiVersion.V3],
    });
  }
}
