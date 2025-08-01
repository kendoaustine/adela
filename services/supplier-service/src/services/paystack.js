const axios = require('axios');
const crypto = require('crypto');
const config = require('../config');
const logger = require('../utils/logger');

class PaystackService {
  constructor() {
    this.secretKey = config.payments.paystack.secretKey;
    this.publicKey = config.payments.paystack.publicKey;
    this.webhookSecret = config.payments.paystack.webhookSecret;
    this.baseURL = 'https://api.paystack.co';

    // Validate required configuration
    if (!this.secretKey) {
      throw new Error('PAYSTACK_SECRET_KEY environment variable is required');
    }
    if (!this.publicKey) {
      throw new Error('PAYSTACK_PUBLIC_KEY environment variable is required');
    }
    if (!this.webhookSecret) {
      logger.warn('PAYSTACK_WEBHOOK_SECRET not configured - webhook verification will be disabled');
    }

    this.client = axios.create({
      baseURL: this.baseURL,
      headers: {
        'Authorization': `Bearer ${this.secretKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });
  }

  /**
   * Initialize a payment transaction
   */
  async initializeTransaction(data) {
    try {
      const {
        email,
        amount, // Amount in kobo (smallest currency unit)
        currency = 'NGN',
        reference,
        callback_url,
        metadata = {},
        channels = ['card', 'bank', 'ussd', 'qr', 'mobile_money', 'bank_transfer']
      } = data;

      const payload = {
        email,
        amount: Math.round(amount * 100), // Convert to kobo
        currency,
        reference,
        callback_url,
        metadata,
        channels
      };

      const response = await this.client.post('/transaction/initialize', payload);
      
      logger.info('Paystack transaction initialized', {
        reference,
        amount: payload.amount,
        email,
        authorization_url: response.data.data.authorization_url
      });

      return {
        success: true,
        data: response.data.data,
        reference: response.data.data.reference,
        authorization_url: response.data.data.authorization_url,
        access_code: response.data.data.access_code
      };
    } catch (error) {
      logger.error('Failed to initialize Paystack transaction', {
        error: error.message,
        response: error.response?.data,
        data
      });
      
      throw new Error(`Paystack initialization failed: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Verify a payment transaction
   */
  async verifyTransaction(reference) {
    try {
      const response = await this.client.get(`/transaction/verify/${reference}`);
      
      const transaction = response.data.data;
      
      logger.info('Paystack transaction verified', {
        reference,
        status: transaction.status,
        amount: transaction.amount,
        gateway_response: transaction.gateway_response
      });

      return {
        success: true,
        data: transaction,
        status: transaction.status,
        amount: transaction.amount / 100, // Convert from kobo to naira
        currency: transaction.currency,
        paid_at: transaction.paid_at,
        gateway_response: transaction.gateway_response,
        channel: transaction.channel,
        fees: transaction.fees / 100,
        authorization: transaction.authorization
      };
    } catch (error) {
      logger.error('Failed to verify Paystack transaction', {
        error: error.message,
        response: error.response?.data,
        reference
      });
      
      throw new Error(`Paystack verification failed: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Create a customer
   */
  async createCustomer(data) {
    try {
      const { email, first_name, last_name, phone, metadata = {} } = data;

      const payload = {
        email,
        first_name,
        last_name,
        phone,
        metadata
      };

      const response = await this.client.post('/customer', payload);
      
      logger.info('Paystack customer created', {
        email,
        customer_code: response.data.data.customer_code
      });

      return {
        success: true,
        data: response.data.data,
        customer_code: response.data.data.customer_code,
        customer_id: response.data.data.id
      };
    } catch (error) {
      logger.error('Failed to create Paystack customer', {
        error: error.message,
        response: error.response?.data,
        data
      });
      
      throw new Error(`Paystack customer creation failed: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Create a payment plan (for subscriptions)
   */
  async createPlan(data) {
    try {
      const {
        name,
        amount, // Amount in naira
        interval, // daily, weekly, monthly, quarterly, biannually, annually
        description,
        currency = 'NGN'
      } = data;

      const payload = {
        name,
        amount: Math.round(amount * 100), // Convert to kobo
        interval,
        description,
        currency
      };

      const response = await this.client.post('/plan', payload);
      
      logger.info('Paystack plan created', {
        name,
        amount: payload.amount,
        interval,
        plan_code: response.data.data.plan_code
      });

      return {
        success: true,
        data: response.data.data,
        plan_code: response.data.data.plan_code,
        plan_id: response.data.data.id
      };
    } catch (error) {
      logger.error('Failed to create Paystack plan', {
        error: error.message,
        response: error.response?.data,
        data
      });
      
      throw new Error(`Paystack plan creation failed: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Create a subscription
   */
  async createSubscription(data) {
    try {
      const {
        customer,
        plan,
        authorization,
        start_date
      } = data;

      const payload = {
        customer,
        plan,
        authorization,
        start_date
      };

      const response = await this.client.post('/subscription', payload);
      
      logger.info('Paystack subscription created', {
        customer,
        plan,
        subscription_code: response.data.data.subscription_code
      });

      return {
        success: true,
        data: response.data.data,
        subscription_code: response.data.data.subscription_code,
        subscription_id: response.data.data.id
      };
    } catch (error) {
      logger.error('Failed to create Paystack subscription', {
        error: error.message,
        response: error.response?.data,
        data
      });
      
      throw new Error(`Paystack subscription creation failed: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Initiate a transfer (for payouts)
   */
  async initiateTransfer(data) {
    try {
      const {
        source = 'balance',
        amount, // Amount in naira
        recipient,
        reason,
        currency = 'NGN',
        reference
      } = data;

      const payload = {
        source,
        amount: Math.round(amount * 100), // Convert to kobo
        recipient,
        reason,
        currency,
        reference
      };

      const response = await this.client.post('/transfer', payload);
      
      logger.info('Paystack transfer initiated', {
        amount: payload.amount,
        recipient,
        reference,
        transfer_code: response.data.data.transfer_code
      });

      return {
        success: true,
        data: response.data.data,
        transfer_code: response.data.data.transfer_code,
        transfer_id: response.data.data.id
      };
    } catch (error) {
      logger.error('Failed to initiate Paystack transfer', {
        error: error.message,
        response: error.response?.data,
        data
      });
      
      throw new Error(`Paystack transfer failed: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Create a transfer recipient
   */
  async createTransferRecipient(data) {
    try {
      const {
        type = 'nuban',
        name,
        account_number,
        bank_code,
        currency = 'NGN',
        description
      } = data;

      const payload = {
        type,
        name,
        account_number,
        bank_code,
        currency,
        description
      };

      const response = await this.client.post('/transferrecipient', payload);
      
      logger.info('Paystack transfer recipient created', {
        name,
        account_number,
        bank_code,
        recipient_code: response.data.data.recipient_code
      });

      return {
        success: true,
        data: response.data.data,
        recipient_code: response.data.data.recipient_code,
        recipient_id: response.data.data.id
      };
    } catch (error) {
      logger.error('Failed to create Paystack transfer recipient', {
        error: error.message,
        response: error.response?.data,
        data
      });
      
      throw new Error(`Paystack recipient creation failed: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Verify webhook signature
   */
  verifyWebhookSignature(payload, signature) {
    try {
      if (!this.webhookSecret) {
        logger.warn('Webhook secret not configured - skipping signature verification');
        return true; // Allow webhook processing in development
      }

      const hash = crypto
        .createHmac('sha512', this.webhookSecret)
        .update(JSON.stringify(payload))
        .digest('hex');

      return hash === signature;
    } catch (error) {
      logger.error('Failed to verify Paystack webhook signature', {
        error: error.message
      });
      return false;
    }
  }

  /**
   * Get supported banks
   */
  async getBanks(country = 'nigeria') {
    try {
      const response = await this.client.get(`/bank?country=${country}`);
      
      return {
        success: true,
        data: response.data.data
      };
    } catch (error) {
      logger.error('Failed to get Paystack banks', {
        error: error.message,
        response: error.response?.data,
        country
      });
      
      throw new Error(`Failed to get banks: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Resolve account number
   */
  async resolveAccountNumber(account_number, bank_code) {
    try {
      const response = await this.client.get(`/bank/resolve?account_number=${account_number}&bank_code=${bank_code}`);
      
      return {
        success: true,
        data: response.data.data,
        account_name: response.data.data.account_name,
        account_number: response.data.data.account_number
      };
    } catch (error) {
      logger.error('Failed to resolve Paystack account', {
        error: error.message,
        response: error.response?.data,
        account_number,
        bank_code
      });
      
      throw new Error(`Account resolution failed: ${error.response?.data?.message || error.message}`);
    }
  }
}

module.exports = new PaystackService();
