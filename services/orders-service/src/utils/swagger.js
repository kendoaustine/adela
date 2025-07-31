const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');
const config = require('../config');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'GasConnect Authentication Service API',
      version: '1.0.0',
      description: 'Authentication and User Management Service for GasConnect platform',
      contact: {
        name: 'GasConnect Team',
        email: 'support@gasconnect.com',
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT',
      },
    },
    servers: [
      {
        url: `http://localhost:${config.port}`,
        description: 'Development server',
      },
      {
        url: 'https://api.gasconnect.com',
        description: 'Production server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT token for authentication',
        },
        refreshToken: {
          type: 'apiKey',
          in: 'cookie',
          name: 'refreshToken',
          description: 'Refresh token stored in HTTP-only cookie',
        },
      },
      schemas: {
        User: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              format: 'uuid',
              description: 'Unique user identifier',
            },
            email: {
              type: 'string',
              format: 'email',
              description: 'User email address',
            },
            phone: {
              type: 'string',
              pattern: '^\\+[1-9]\\d{1,14}$',
              description: 'User phone number in E.164 format',
            },
            role: {
              type: 'string',
              enum: ['hospital', 'artisan', 'household', 'supplier', 'delivery_driver', 'platform_admin'],
              description: 'User role in the system',
            },
            isActive: {
              type: 'boolean',
              description: 'Whether the user account is active',
            },
            isVerified: {
              type: 'boolean',
              description: 'Whether the user account is verified',
            },
            emailVerifiedAt: {
              type: 'string',
              format: 'date-time',
              nullable: true,
              description: 'Timestamp when email was verified',
            },
            phoneVerifiedAt: {
              type: 'string',
              format: 'date-time',
              nullable: true,
              description: 'Timestamp when phone was verified',
            },
            lastLoginAt: {
              type: 'string',
              format: 'date-time',
              nullable: true,
              description: 'Timestamp of last login',
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
              description: 'Account creation timestamp',
            },
            updatedAt: {
              type: 'string',
              format: 'date-time',
              description: 'Last update timestamp',
            },
          },
        },
        Profile: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              format: 'uuid',
            },
            userId: {
              type: 'string',
              format: 'uuid',
            },
            firstName: {
              type: 'string',
              maxLength: 100,
            },
            lastName: {
              type: 'string',
              maxLength: 100,
            },
            businessName: {
              type: 'string',
              maxLength: 255,
              nullable: true,
            },
            pictureUrl: {
              type: 'string',
              format: 'uri',
              nullable: true,
            },
            dateOfBirth: {
              type: 'string',
              format: 'date',
              nullable: true,
            },
            gender: {
              type: 'string',
              maxLength: 20,
              nullable: true,
            },
            preferences: {
              type: 'object',
              description: 'User preferences as JSON object',
            },
            emergencyContactName: {
              type: 'string',
              maxLength: 255,
              nullable: true,
            },
            emergencyContactPhone: {
              type: 'string',
              maxLength: 20,
              nullable: true,
            },
          },
        },
        Address: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              format: 'uuid',
            },
            userId: {
              type: 'string',
              format: 'uuid',
            },
            label: {
              type: 'string',
              maxLength: 50,
              description: 'Address label (e.g., home, work, hospital)',
            },
            addressLine1: {
              type: 'string',
              maxLength: 255,
            },
            addressLine2: {
              type: 'string',
              maxLength: 255,
              nullable: true,
            },
            city: {
              type: 'string',
              maxLength: 100,
            },
            state: {
              type: 'string',
              maxLength: 100,
            },
            postalCode: {
              type: 'string',
              maxLength: 20,
              nullable: true,
            },
            country: {
              type: 'string',
              maxLength: 100,
              default: 'Nigeria',
            },
            latitude: {
              type: 'number',
              format: 'double',
              nullable: true,
            },
            longitude: {
              type: 'number',
              format: 'double',
              nullable: true,
            },
            isDefault: {
              type: 'boolean',
              default: false,
            },
            deliveryInstructions: {
              type: 'string',
              nullable: true,
            },
          },
        },
        Error: {
          type: 'object',
          properties: {
            error: {
              type: 'object',
              properties: {
                message: {
                  type: 'string',
                  description: 'Error message',
                },
                code: {
                  type: 'string',
                  description: 'Error code',
                },
                statusCode: {
                  type: 'integer',
                  description: 'HTTP status code',
                },
                validation: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      field: {
                        type: 'string',
                      },
                      message: {
                        type: 'string',
                      },
                      value: {
                        type: 'string',
                      },
                    },
                  },
                  description: 'Validation errors (if applicable)',
                },
              },
            },
            timestamp: {
              type: 'string',
              format: 'date-time',
            },
            path: {
              type: 'string',
            },
            method: {
              type: 'string',
            },
            requestId: {
              type: 'string',
              description: 'Request ID for tracking',
            },
          },
        },
        AuthTokens: {
          type: 'object',
          properties: {
            accessToken: {
              type: 'string',
              description: 'JWT access token',
            },
            refreshToken: {
              type: 'string',
              description: 'JWT refresh token',
            },
            expiresIn: {
              type: 'integer',
              description: 'Access token expiration time in seconds',
            },
            tokenType: {
              type: 'string',
              default: 'Bearer',
            },
          },
        },
      },
      responses: {
        UnauthorizedError: {
          description: 'Authentication required',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error',
              },
            },
          },
        },
        ForbiddenError: {
          description: 'Access denied',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error',
              },
            },
          },
        },
        NotFoundError: {
          description: 'Resource not found',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error',
              },
            },
          },
        },
        ValidationError: {
          description: 'Validation failed',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error',
              },
            },
          },
        },
        ConflictError: {
          description: 'Resource conflict',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error',
              },
            },
          },
        },
        RateLimitError: {
          description: 'Too many requests',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error',
              },
            },
          },
        },
        InternalServerError: {
          description: 'Internal server error',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error',
              },
            },
          },
        },
      },
    },
    security: [
      {
        bearerAuth: [],
      },
    ],
  },
  apis: ['./src/routes/*.js'], // Path to the API files
};

const specs = swaggerJsdoc(options);

const setupSwagger = (app) => {
  // Swagger UI options
  const swaggerOptions = {
    explorer: true,
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'GasConnect Auth API Documentation',
    swaggerOptions: {
      persistAuthorization: true,
      displayRequestDuration: true,
      filter: true,
      tryItOutEnabled: true,
    },
  };

  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(specs, swaggerOptions));
  
  // JSON endpoint for the OpenAPI spec
  app.get('/api/docs.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(specs);
  });
};

module.exports = {
  setupSwagger,
  specs,
};
