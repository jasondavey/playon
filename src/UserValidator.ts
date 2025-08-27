import { User, CreateUserData, UpdateUserData } from "./UsersApi.js";

/**
 * Custom validation error with detailed information
 */
export class ValidationError extends Error {
  constructor(
    message: string,
    public readonly field: string,
    public readonly value: unknown,
    public readonly correlationId?: string
  ) {
    super(message);
    this.name = "ValidationError";
  }
}

/**
 * Validation result with success status and details
 */
export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  field?: string;
}

/**
 * User data validation service
 */
export class UserValidator {
  /**
   * Validate email format
   */
  private static isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Validate phone format (supports international formats and extensions)
   */
  private static isValidPhone(phone: string): boolean {
    // Remove all non-digit characters except + for international prefix
    const cleanPhone = phone.replace(/[^\d+]/g, "");

    // Allow various real-world phone formats:
    // - International: +1234567890
    // - Domestic: 1234567890
    // - With extensions (original format preserved for this check)
    const phonePatterns = [
      /^[\+]?[1-9]\d{6,14}$/, // Basic international format (7-15 digits)
      /^\d{10}$/, // US 10-digit format
      /^[\+]?1\d{10}$/, // US with country code
    ];

    // Check if cleaned phone matches basic patterns
    const basicMatch = phonePatterns.some((pattern) =>
      pattern.test(cleanPhone)
    );

    // Also allow phones with extensions (x, ext, extension)
    const extensionPattern =
      /^[\+]?[\d\s\-\(\)\.]+(\s*(x|ext|extension)\s*\d+)?$/i;
    const hasValidExtension = extensionPattern.test(phone);

    return basicMatch || (hasValidExtension && cleanPhone.length >= 7);
  }

  /**
   * Validate website URL format
   */
  private static isValidWebsite(website: string): boolean {
    try {
      new URL(website.startsWith("http") ? website : `https://${website}`);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Validate User object structure and data
   */
  static validateUser(user: unknown, correlationId?: string): User {
    const id = correlationId || "validation";
    console.log(`[${id}] Validating User object...`);

    if (!user || typeof user !== "object") {
      const error = new ValidationError(
        "User must be an object",
        "user",
        user,
        id
      );
      console.error(`[${id}] Validation failed: ${error.message}`);
      throw error;
    }

    const userObj = user as Record<string, unknown>;
    const errors: ValidationError[] = [];

    // Validate required fields
    if (
      !userObj.name ||
      typeof userObj.name !== "string" ||
      userObj.name.trim().length === 0
    ) {
      errors.push(
        new ValidationError(
          "Name is required and must be a non-empty string",
          "name",
          userObj.name,
          id
        )
      );
    }

    // Validate username (required for creation, optional for responses)
    if (
      userObj.username !== undefined &&
      (typeof userObj.username !== "string" || userObj.username.trim() === "")
    ) {
      errors.push(
        new ValidationError(
          "Username must be a non-empty string",
          "username",
          userObj.username,
          id
        )
      );
    }

    if (
      !userObj.email ||
      typeof userObj.email !== "string" ||
      !this.isValidEmail(userObj.email)
    ) {
      errors.push(
        new ValidationError(
          "Email is required and must be a valid email address",
          "email",
          userObj.email,
          id
        )
      );
    }

    // Validate optional fields
    if (
      userObj.phone &&
      (typeof userObj.phone !== "string" || !this.isValidPhone(userObj.phone))
    ) {
      errors.push(
        new ValidationError(
          "Phone must be a valid phone number",
          "phone",
          userObj.phone,
          id
        )
      );
    }

    if (
      userObj.website &&
      (typeof userObj.website !== "string" ||
        !this.isValidWebsite(userObj.website))
    ) {
      errors.push(
        new ValidationError(
          "Website must be a valid URL",
          "website",
          userObj.website,
          id
        )
      );
    }

    // Validate ID if present
    if (
      userObj.id !== undefined &&
      (typeof userObj.id !== "number" || userObj.id <= 0)
    ) {
      errors.push(
        new ValidationError(
          "ID must be a positive number",
          "id",
          userObj.id,
          id
        )
      );
    }

    if (errors.length > 0) {
      console.error(`[${id}] Validation failed with ${errors.length} errors:`);
      errors.forEach((error) =>
        console.error(`[${id}] - ${error.field}: ${error.message}`)
      );
      throw errors[0]; // Throw first error
    }

    console.log(`[${id}] ✅ User validation successful`);
    return userObj as unknown as User;
  }

  /**
   * Validate CreateUserData object
   */
  static validateCreateUserData(
    userData: unknown,
    correlationId?: string
  ): CreateUserData {
    const id = correlationId || "validation";
    console.log(`[${id}] Validating CreateUserData object...`);

    if (!userData || typeof userData !== "object") {
      const error = new ValidationError(
        "User data must be an object",
        "userData",
        userData,
        id
      );
      console.error(`[${id}] Validation failed: ${error.message}`);
      throw error;
    }

    const userObj = userData as Record<string, unknown>;
    const errors: ValidationError[] = [];

    // Validate required fields for creation
    if (
      !userObj.name ||
      typeof userObj.name !== "string" ||
      userObj.name.trim().length === 0
    ) {
      errors.push(
        new ValidationError(
          "Name is required and must be a non-empty string",
          "name",
          userObj.name,
          id
        )
      );
    }

    if (
      !userObj.username ||
      typeof userObj.username !== "string" ||
      userObj.username.trim().length === 0
    ) {
      errors.push(
        new ValidationError(
          "Username is required and must be a non-empty string",
          "username",
          userObj.username,
          id
        )
      );
    }

    if (
      !userObj.email ||
      typeof userObj.email !== "string" ||
      !this.isValidEmail(userObj.email)
    ) {
      errors.push(
        new ValidationError(
          "Email is required and must be a valid email address",
          "email",
          userObj.email,
          id
        )
      );
    }

    // Validate optional fields
    if (
      userObj.phone &&
      (typeof userObj.phone !== "string" || !this.isValidPhone(userObj.phone))
    ) {
      errors.push(
        new ValidationError(
          "Phone must be a valid phone number",
          "phone",
          userObj.phone,
          id
        )
      );
    }

    if (
      userObj.website &&
      (typeof userObj.website !== "string" ||
        !this.isValidWebsite(userObj.website))
    ) {
      errors.push(
        new ValidationError(
          "Website must be a valid URL",
          "website",
          userObj.website,
          id
        )
      );
    }

    // ID should not be present in create data
    if (userObj.id !== undefined) {
      errors.push(
        new ValidationError(
          "ID should not be provided when creating a user",
          "id",
          userObj.id,
          id
        )
      );
    }

    if (errors.length > 0) {
      console.error(
        `[${id}] CreateUserData validation failed with ${errors.length} errors:`
      );
      errors.forEach((error) =>
        console.error(`[${id}] - ${error.field}: ${error.message}`)
      );
      throw errors[0];
    }

    console.log(`[${id}] ✅ CreateUserData validation successful`);
    return userObj as unknown as CreateUserData;
  }

  /**
   * Validate UpdateUserData object
   */
  static validateUpdateUserData(
    userData: unknown,
    correlationId?: string
  ): UpdateUserData {
    const id = correlationId || "validation";
    console.log(`[${id}] Validating UpdateUserData object...`);

    if (!userData || typeof userData !== "object") {
      const error = new ValidationError(
        "Update data must be an object",
        "userData",
        userData,
        id
      );
      console.error(`[${id}] Validation failed: ${error.message}`);
      throw error;
    }

    const userObj = userData as Record<string, unknown>;
    const errors: ValidationError[] = [];

    // At least one field must be provided for update
    const hasValidField = Object.keys(userObj).some(
      (key) =>
        ["name", "username", "email", "phone", "website"].includes(key) &&
        userObj[key] !== undefined
    );

    if (!hasValidField) {
      errors.push(
        new ValidationError(
          "At least one field must be provided for update",
          "userData",
          userData,
          id
        )
      );
    }

    // Validate fields if present
    if (
      userObj.name !== undefined &&
      (typeof userObj.name !== "string" || userObj.name.trim().length === 0)
    ) {
      errors.push(
        new ValidationError(
          "Name must be a non-empty string",
          "name",
          userObj.name,
          id
        )
      );
    }

    if (
      userObj.username !== undefined &&
      (typeof userObj.username !== "string" ||
        userObj.username.trim().length === 0)
    ) {
      errors.push(
        new ValidationError(
          "Username must be a non-empty string",
          "username",
          userObj.username,
          id
        )
      );
    }

    if (
      userObj.email !== undefined &&
      (typeof userObj.email !== "string" || !this.isValidEmail(userObj.email))
    ) {
      errors.push(
        new ValidationError(
          "Email must be a valid email address",
          "email",
          userObj.email,
          id
        )
      );
    }

    if (
      userObj.phone !== undefined &&
      (typeof userObj.phone !== "string" || !this.isValidPhone(userObj.phone))
    ) {
      errors.push(
        new ValidationError(
          "Phone must be a valid phone number",
          "phone",
          userObj.phone,
          id
        )
      );
    }

    if (
      userObj.website !== undefined &&
      (typeof userObj.website !== "string" ||
        !this.isValidWebsite(userObj.website))
    ) {
      errors.push(
        new ValidationError(
          "Website must be a valid URL",
          "website",
          userObj.website,
          id
        )
      );
    }

    if (errors.length > 0) {
      console.error(
        `[${id}] UpdateUserData validation failed with ${errors.length} errors:`
      );
      errors.forEach((error) =>
        console.error(`[${id}] - ${error.field}: ${error.message}`)
      );
      throw errors[0];
    }

    console.log(`[${id}] ✅ UpdateUserData validation successful`);
    return userObj as unknown as UpdateUserData;
  }

  /**
   * Validate User ID parameter
   */
  static validateUserId(userId: unknown, correlationId?: string): number {
    const id = correlationId || "validation";
    console.log(`[${id}] Validating User ID: ${userId}`);

    if (
      typeof userId !== "number" ||
      !Number.isInteger(userId) ||
      userId <= 0
    ) {
      const error = new ValidationError(
        "User ID must be a positive integer",
        "userId",
        userId,
        id
      );
      console.error(`[${id}] Validation failed: ${error.message}`);
      throw error;
    }

    console.log(`[${id}] ✅ User ID validation successful`);
    return userId;
  }

  /**
   * Validate array of users
   */
  static validateUsersArray(users: unknown, correlationId?: string): User[] {
    const id = correlationId || "validation";
    console.log(`[${id}] Validating Users array...`);

    if (!Array.isArray(users)) {
      const error = new ValidationError(
        "Users must be an array",
        "users",
        users,
        id
      );
      console.error(`[${id}] Validation failed: ${error.message}`);
      throw error;
    }

    const validatedUsers: User[] = [];
    for (let i = 0; i < users.length; i++) {
      try {
        const validUser = this.validateUser(users[i], `${id}-user-${i}`);
        validatedUsers.push(validUser);
      } catch (error) {
        const validationError = new ValidationError(
          `Invalid user at index ${i}: ${
            error instanceof Error ? error.message : "Unknown error"
          }`,
          `users[${i}]`,
          users[i],
          id
        );
        console.error(`[${id}] Validation failed: ${validationError.message}`);
        throw validationError;
      }
    }

    console.log(
      `[${id}] ✅ Users array validation successful (${validatedUsers.length} users)`
    );
    return validatedUsers;
  }
}
