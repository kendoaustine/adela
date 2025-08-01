const { query } = require('../database/connection');
const { publishEvent } = require('../services/rabbitmq');
const paystack = require('../services/paystack');
const logger = require('../utils/logger');
const { ValidationError, NotFoundError, BusinessLogicError } = require('../middleware/errorHandler');

class PaymentController {
  /**
   * Get user wallet information
   */
  static async getWallet(req, res) {
    const userId = req.user.id;
    const { currency = 'NGN' } = req.query;

    try {
      const walletQuery = `
        SELECT * FROM payments.wallets 
        WHERE user_id = $1 AND currency = $2 AND is_active = true
      `;
      
      const result = await query(walletQuery, [userId, currency]);
      
      if (result.rows.length === 0) {
        // Create wallet if it doesn't exist
        const createWalletQuery = `
          INSERT INTO payments.wallets (user_id, currency, balance)
          VALUES ($1, $2, 0.00)
          RETURNING *
        `;
        
        const createResult = await query(createWalletQuery, [userId, currency]);
        const wallet = createResult.rows[0];
        
        return res.json({
          wallet: {
            id: wallet.id,
            userId: wallet.user_id,
            balance: parseFloat(wallet.balance),
            currency: wallet.currency,
            isActive: wallet.is_active,
            createdAt: wallet.created_at,
            updatedAt: wallet.updated_at
          }
        });
      }

      const wallet = result.rows[0];
      
      res.json({
        wallet: {
          id: wallet.id,
          userId: wallet.user_id,
          balance: parseFloat(wallet.balance),
          currency: wallet.currency,
          isActive: wallet.is_active,
          createdAt: wallet.created_at,
          updatedAt: wallet.updated_at
        }
      });
    } catch (error) {
      logger.error('Failed to get wallet:', {
        error: error.message,
        userId,
        currency
      });
      throw error;
    }
  }

  /**
   * Get payment methods for user
   */
  static async getPaymentMethods(req, res) {
    const userId = req.user.id;

    try {
      const paymentMethodsQuery = `
        SELECT * FROM payments.payment_methods 
        WHERE user_id = $1 AND is_active = true
        ORDER BY is_default DESC, created_at DESC
      `;
      
      const result = await query(paymentMethodsQuery, [userId]);
      
      const paymentMethods = result.rows.map(row => ({
        id: row.id,
        userId: row.user_id,
        type: row.type,
        provider: row.provider,
        cardLastFour: row.card_last_four,
        cardBrand: row.card_brand,
        bankName: row.bank_name,
        accountNumber: row.account_number ? `****${row.account_number.slice(-4)}` : null,
        isDefault: row.is_default,
        isActive: row.is_active,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }));

      res.json({
        paymentMethods,
        total: paymentMethods.length
      });
    } catch (error) {
      logger.error('Failed to get payment methods:', {
        error: error.message,
        userId
      });
      throw error;
    }
  }

  /**
   * Add new payment method
   */
  static async addPaymentMethod(req, res) {
    const userId = req.user.id;
    const {
      type,
      provider,
      externalId,
      cardLastFour,
      cardBrand,
      bankName,
      accountNumber,
      isDefault = false,
      metadata = {}
    } = req.body;

    try {
      // If setting as default, unset other defaults
      if (isDefault) {
        await query(
          'UPDATE payments.payment_methods SET is_default = false WHERE user_id = $1',
          [userId]
        );
      }

      const insertQuery = `
        INSERT INTO payments.payment_methods (
          user_id, type, provider, external_id, card_last_four, 
          card_brand, bank_name, account_number, is_default, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *
      `;

      const result = await query(insertQuery, [
        userId, type, provider, externalId, cardLastFour,
        cardBrand, bankName, accountNumber, isDefault, JSON.stringify(metadata)
      ]);

      const paymentMethod = result.rows[0];

      // Publish payment method added event
      await publishEvent('payments.events', 'payment.method.added', {
        eventType: 'payment.method.added',
        userId,
        paymentMethodId: paymentMethod.id,
        type,
        provider,
        isDefault,
        timestamp: new Date().toISOString()
      });

      logger.info('Payment method added', {
        paymentMethodId: paymentMethod.id,
        userId,
        type,
        provider
      });

      res.status(201).json({
        message: 'Payment method added successfully',
        paymentMethod: {
          id: paymentMethod.id,
          userId: paymentMethod.user_id,
          type: paymentMethod.type,
          provider: paymentMethod.provider,
          cardLastFour: paymentMethod.card_last_four,
          cardBrand: paymentMethod.card_brand,
          bankName: paymentMethod.bank_name,
          accountNumber: paymentMethod.account_number ? `****${paymentMethod.account_number.slice(-4)}` : null,
          isDefault: paymentMethod.is_default,
          isActive: paymentMethod.is_active,
          createdAt: paymentMethod.created_at,
          updatedAt: paymentMethod.updated_at
        }
      });
    } catch (error) {
      logger.error('Failed to add payment method:', {
        error: error.message,
        userId,
        type
      });
      throw error;
    }
  }

  /**
   * Get transaction history
   */
  static async getTransactions(req, res) {
    const userId = req.user.id;
    const { 
      type, 
      status, 
      startDate, 
      endDate, 
      limit = 20, 
      offset = 0 
    } = req.query;

    try {
      let whereClause = 'WHERE t.user_id = $1';
      const queryParams = [userId];
      let paramIndex = 2;

      // Add filters
      if (type) {
        whereClause += ` AND t.type = $${paramIndex}`;
        queryParams.push(type);
        paramIndex++;
      }

      if (status) {
        whereClause += ` AND t.status = $${paramIndex}`;
        queryParams.push(status);
        paramIndex++;
      }

      if (startDate) {
        whereClause += ` AND t.created_at >= $${paramIndex}`;
        queryParams.push(startDate);
        paramIndex++;
      }

      if (endDate) {
        whereClause += ` AND t.created_at <= $${paramIndex}`;
        queryParams.push(endDate);
        paramIndex++;
      }

      const transactionsQuery = `
        SELECT 
          t.*,
          pm.type as payment_method_type,
          pm.card_last_four,
          pm.card_brand
        FROM payments.transactions t
        LEFT JOIN payments.payment_methods pm ON t.payment_method_id = pm.id
        ${whereClause}
        ORDER BY t.created_at DESC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;

      queryParams.push(parseInt(limit), parseInt(offset));
      const result = await query(transactionsQuery, queryParams);

      // Get total count
      const countQuery = `
        SELECT COUNT(*) as total
        FROM payments.transactions t
        ${whereClause}
      `;

      const countResult = await query(countQuery, queryParams.slice(0, -2));
      const total = parseInt(countResult.rows[0].total);

      const transactions = result.rows.map(row => ({
        id: row.id,
        userId: row.user_id,
        orderId: row.order_id,
        type: row.type,
        status: row.status,
        amount: parseFloat(row.amount),
        currency: row.currency,
        description: row.description,
        fees: parseFloat(row.fees),
        netAmount: parseFloat(row.net_amount),
        paymentMethod: row.payment_method_id ? {
          id: row.payment_method_id,
          type: row.payment_method_type,
          cardLastFour: row.card_last_four,
          cardBrand: row.card_brand
        } : null,
        provider: row.provider,
        externalReference: row.external_reference,
        processedAt: row.processed_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }));

      res.json({
        transactions,
        pagination: {
          total,
          page: Math.floor(offset / limit) + 1,
          limit: parseInt(limit),
          hasNext: offset + limit < total,
          hasPrev: offset > 0
        }
      });
    } catch (error) {
      logger.error('Failed to get transactions:', {
        error: error.message,
        userId
      });
      throw error;
    }
  }

  /**
   * Credit wallet (add funds)
   */
  static async creditWallet(req, res) {
    const userId = req.user.id;
    const { amount, currency = 'NGN', description, paymentMethodId } = req.body;

    try {
      if (amount <= 0) {
        throw new ValidationError('Amount must be greater than 0');
      }

      // Start transaction
      await query('BEGIN');

      try {
        // Get or create wallet
        let walletResult = await query(
          'SELECT * FROM payments.wallets WHERE user_id = $1 AND currency = $2',
          [userId, currency]
        );

        if (walletResult.rows.length === 0) {
          walletResult = await query(
            'INSERT INTO payments.wallets (user_id, currency, balance) VALUES ($1, $2, 0.00) RETURNING *',
            [userId, currency]
          );
        }

        const wallet = walletResult.rows[0];

        // Create transaction record
        const transactionResult = await query(`
          INSERT INTO payments.transactions (
            user_id, wallet_id, payment_method_id, type, status,
            amount, currency, description
          ) VALUES ($1, $2, $3, 'wallet_credit', 'completed', $4, $5, $6)
          RETURNING *
        `, [userId, wallet.id, paymentMethodId, amount, currency, description]);

        // Update wallet balance
        await query(
          'UPDATE payments.wallets SET balance = balance + $1 WHERE id = $2',
          [amount, wallet.id]
        );

        // Get updated wallet
        const updatedWalletResult = await query(
          'SELECT * FROM payments.wallets WHERE id = $1',
          [wallet.id]
        );

        await query('COMMIT');

        const transaction = transactionResult.rows[0];
        const updatedWallet = updatedWalletResult.rows[0];

        // Publish wallet credited event
        await publishEvent('payments.events', 'wallet.credited', {
          eventType: 'wallet.credited',
          userId,
          walletId: wallet.id,
          transactionId: transaction.id,
          amount,
          currency,
          newBalance: parseFloat(updatedWallet.balance),
          timestamp: new Date().toISOString()
        });

        logger.info('Wallet credited', {
          userId,
          walletId: wallet.id,
          amount,
          currency,
          newBalance: updatedWallet.balance
        });

        res.json({
          message: 'Wallet credited successfully',
          transaction: {
            id: transaction.id,
            type: transaction.type,
            status: transaction.status,
            amount: parseFloat(transaction.amount),
            currency: transaction.currency,
            description: transaction.description,
            createdAt: transaction.created_at
          },
          wallet: {
            id: updatedWallet.id,
            balance: parseFloat(updatedWallet.balance),
            currency: updatedWallet.currency
          }
        });
      } catch (error) {
        await query('ROLLBACK');
        throw error;
      }
    } catch (error) {
      logger.error('Failed to credit wallet:', {
        error: error.message,
        userId,
        amount,
        currency
      });
      throw error;
    }
  }

  /**
   * Process payment for order
   */
  static async processPayment(req, res) {
    const userId = req.user.id;
    const {
      orderId,
      amount,
      currency = 'NGN',
      paymentMethodId,
      description,
      useEscrow = true
    } = req.body;

    try {
      if (amount <= 0) {
        throw new ValidationError('Amount must be greater than 0');
      }

      // Start transaction
      await query('BEGIN');

      try {
        // Verify payment method belongs to user
        const paymentMethodResult = await query(
          'SELECT * FROM payments.payment_methods WHERE id = $1 AND user_id = $2 AND is_active = true',
          [paymentMethodId, userId]
        );

        if (paymentMethodResult.rows.length === 0) {
          throw new NotFoundError('Payment method not found');
        }

        const paymentMethod = paymentMethodResult.rows[0];

        // Create transaction record
        const transactionResult = await query(`
          INSERT INTO payments.transactions (
            user_id, order_id, payment_method_id, type, status,
            amount, currency, description, provider
          ) VALUES ($1, $2, $3, 'payment', 'completed', $4, $5, $6, $7)
          RETURNING *
        `, [userId, orderId, paymentMethodId, amount, currency, description, paymentMethod.provider]);

        const transaction = transactionResult.rows[0];

        // If using escrow, create escrow record
        if (useEscrow && orderId) {
          await query(`
            INSERT INTO payments.escrow (
              transaction_id, order_id, amount, currency, status
            ) VALUES ($1, $2, $3, $4, 'held')
          `, [transaction.id, orderId, amount, currency]);
        }

        await query('COMMIT');

        // Publish payment processed event
        await publishEvent('payments.events', 'payment.processed', {
          eventType: 'payment.processed',
          userId,
          orderId,
          transactionId: transaction.id,
          amount,
          currency,
          paymentMethodType: paymentMethod.type,
          useEscrow,
          timestamp: new Date().toISOString()
        });

        logger.info('Payment processed', {
          userId,
          orderId,
          transactionId: transaction.id,
          amount,
          currency,
          useEscrow
        });

        res.json({
          message: 'Payment processed successfully',
          transaction: {
            id: transaction.id,
            orderId: transaction.order_id,
            type: transaction.type,
            status: transaction.status,
            amount: parseFloat(transaction.amount),
            currency: transaction.currency,
            description: transaction.description,
            provider: transaction.provider,
            createdAt: transaction.created_at
          },
          escrow: useEscrow ? {
            status: 'held',
            message: 'Payment held in escrow until delivery confirmation'
          } : null
        });
      } catch (error) {
        await query('ROLLBACK');
        throw error;
      }
    } catch (error) {
      logger.error('Failed to process payment:', {
        error: error.message,
        userId,
        orderId,
        amount
      });
      throw error;
    }
  }

  /**
   * Initialize Paystack payment
   */
  static async initializePaystackPayment(req, res) {
    const userId = req.user.id;
    const {
      amount,
      currency = 'NGN',
      email,
      orderId,
      description,
      callback_url
    } = req.body;

    try {
      if (amount <= 0) {
        throw new ValidationError('Amount must be greater than 0');
      }

      if (!email) {
        throw new ValidationError('Email is required for Paystack payment');
      }

      // Generate unique reference
      const reference = `gasconnect_${userId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Initialize Paystack transaction
      const paystackResponse = await paystack.initializeTransaction({
        email,
        amount,
        currency,
        reference,
        callback_url,
        metadata: {
          userId,
          orderId,
          description
        }
      });

      // Create transaction record
      const transactionResult = await query(`
        INSERT INTO payments.transactions (
          user_id, order_id, type, status, amount, currency,
          description, external_reference, provider
        ) VALUES ($1, $2, 'payment', 'pending', $3, $4, $5, $6, 'paystack')
        RETURNING *
      `, [userId, orderId, amount, currency, description, reference]);

      const transaction = transactionResult.rows[0];

      logger.info('Paystack payment initialized', {
        userId,
        orderId,
        transactionId: transaction.id,
        reference,
        amount,
        currency
      });

      res.json({
        message: 'Payment initialized successfully',
        transaction: {
          id: transaction.id,
          reference,
          status: 'pending'
        },
        paystack: {
          authorization_url: paystackResponse.authorization_url,
          access_code: paystackResponse.access_code,
          reference: paystackResponse.reference
        }
      });
    } catch (error) {
      logger.error('Failed to initialize Paystack payment:', {
        error: error.message,
        userId,
        orderId,
        amount
      });
      throw error;
    }
  }

  /**
   * Verify Paystack payment
   */
  static async verifyPaystackPayment(req, res) {
    const { reference } = req.params;

    try {
      // Verify with Paystack
      const paystackResponse = await paystack.verifyTransaction(reference);

      if (!paystackResponse.success) {
        throw new ValidationError('Payment verification failed');
      }

      // Update transaction in database
      const updateResult = await query(`
        UPDATE payments.transactions
        SET
          status = $1,
          provider_response = $2,
          fees = $3,
          processed_at = CURRENT_TIMESTAMP
        WHERE external_reference = $4
        RETURNING *
      `, [
        paystackResponse.status === 'success' ? 'completed' : 'failed',
        JSON.stringify(paystackResponse.data),
        paystackResponse.fees || 0,
        reference
      ]);

      if (updateResult.rows.length === 0) {
        throw new NotFoundError('Transaction not found');
      }

      const transaction = updateResult.rows[0];

      // If payment successful and has order, update wallet or process order
      if (paystackResponse.status === 'success') {
        // Publish payment success event
        await publishEvent('payments.events', 'payment.verified', {
          eventType: 'payment.verified',
          userId: transaction.user_id,
          orderId: transaction.order_id,
          transactionId: transaction.id,
          amount: parseFloat(transaction.amount),
          currency: transaction.currency,
          reference,
          timestamp: new Date().toISOString()
        });

        logger.info('Paystack payment verified successfully', {
          userId: transaction.user_id,
          orderId: transaction.order_id,
          transactionId: transaction.id,
          reference,
          amount: parseFloat(transaction.amount)
        });
      }

      res.json({
        message: 'Payment verification completed',
        transaction: {
          id: transaction.id,
          status: transaction.status,
          amount: parseFloat(transaction.amount),
          currency: transaction.currency,
          reference,
          processedAt: transaction.processed_at
        },
        paystack: {
          status: paystackResponse.status,
          gateway_response: paystackResponse.gateway_response,
          channel: paystackResponse.channel,
          paid_at: paystackResponse.paid_at
        }
      });
    } catch (error) {
      logger.error('Failed to verify Paystack payment:', {
        error: error.message,
        reference
      });
      throw error;
    }
  }

  /**
   * Handle Paystack webhook
   */
  static async handlePaystackWebhook(req, res) {
    const signature = req.headers['x-paystack-signature'];
    const payload = req.body;

    try {
      // Verify webhook signature
      if (!paystack.verifyWebhookSignature(payload, signature)) {
        throw new ValidationError('Invalid webhook signature');
      }

      const { event, data } = payload;

      logger.info('Paystack webhook received', {
        event,
        reference: data.reference,
        status: data.status
      });

      switch (event) {
        case 'charge.success':
          await this.handleChargeSuccess(data);
          break;
        case 'charge.failed':
          await this.handleChargeFailed(data);
          break;
        case 'transfer.success':
          await this.handleTransferSuccess(data);
          break;
        case 'transfer.failed':
          await this.handleTransferFailed(data);
          break;
        default:
          logger.info('Unhandled Paystack webhook event', { event });
      }

      res.status(200).json({ message: 'Webhook processed successfully' });
    } catch (error) {
      logger.error('Failed to process Paystack webhook:', {
        error: error.message,
        event: payload.event,
        reference: payload.data?.reference
      });
      res.status(400).json({ error: 'Webhook processing failed' });
    }
  }

  /**
   * Handle successful charge webhook
   */
  static async handleChargeSuccess(data) {
    const { reference, amount, currency, customer, authorization } = data;

    try {
      // Update transaction status
      await query(`
        UPDATE payments.transactions
        SET
          status = 'completed',
          provider_response = $1,
          processed_at = CURRENT_TIMESTAMP
        WHERE external_reference = $2
      `, [JSON.stringify(data), reference]);

      // Publish event
      await publishEvent('payments.events', 'charge.success', {
        eventType: 'charge.success',
        reference,
        amount: amount / 100, // Convert from kobo
        currency,
        customer,
        authorization,
        timestamp: new Date().toISOString()
      });

      logger.info('Charge success webhook processed', { reference, amount });
    } catch (error) {
      logger.error('Failed to handle charge success webhook', {
        error: error.message,
        reference
      });
      throw error;
    }
  }

  /**
   * Handle failed charge webhook
   */
  static async handleChargeFailed(data) {
    const { reference, gateway_response } = data;

    try {
      // Update transaction status
      await query(`
        UPDATE payments.transactions
        SET
          status = 'failed',
          provider_response = $1,
          processed_at = CURRENT_TIMESTAMP
        WHERE external_reference = $2
      `, [JSON.stringify(data), reference]);

      // Publish event
      await publishEvent('payments.events', 'charge.failed', {
        eventType: 'charge.failed',
        reference,
        gateway_response,
        timestamp: new Date().toISOString()
      });

      logger.info('Charge failed webhook processed', { reference, gateway_response });
    } catch (error) {
      logger.error('Failed to handle charge failed webhook', {
        error: error.message,
        reference
      });
      throw error;
    }
  }

  /**
   * Handle successful transfer webhook
   */
  static async handleTransferSuccess(data) {
    const { reference, amount, currency, recipient } = data;

    try {
      // Publish event
      await publishEvent('payments.events', 'transfer.success', {
        eventType: 'transfer.success',
        reference,
        amount: amount / 100, // Convert from kobo
        currency,
        recipient,
        timestamp: new Date().toISOString()
      });

      logger.info('Transfer success webhook processed', { reference, amount });
    } catch (error) {
      logger.error('Failed to handle transfer success webhook', {
        error: error.message,
        reference
      });
      throw error;
    }
  }

  /**
   * Handle failed transfer webhook
   */
  static async handleTransferFailed(data) {
    const { reference, failure_reason } = data;

    try {
      // Publish event
      await publishEvent('payments.events', 'transfer.failed', {
        eventType: 'transfer.failed',
        reference,
        failure_reason,
        timestamp: new Date().toISOString()
      });

      logger.info('Transfer failed webhook processed', { reference, failure_reason });
    } catch (error) {
      logger.error('Failed to handle transfer failed webhook', {
        error: error.message,
        reference
      });
      throw error;
    }
  }

  /**
   * Get supported banks
   */
  static async getSupportedBanks(req, res) {
    try {
      const banks = await paystack.getBanks();

      res.json({
        message: 'Banks retrieved successfully',
        banks: banks.data
      });
    } catch (error) {
      logger.error('Failed to get supported banks:', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Resolve account number
   */
  static async resolveAccountNumber(req, res) {
    const { account_number, bank_code } = req.body;

    try {
      if (!account_number || !bank_code) {
        throw new ValidationError('Account number and bank code are required');
      }

      const accountInfo = await paystack.resolveAccountNumber(account_number, bank_code);

      res.json({
        message: 'Account resolved successfully',
        account: accountInfo.data
      });
    } catch (error) {
      logger.error('Failed to resolve account number:', {
        error: error.message,
        account_number,
        bank_code
      });
      throw error;
    }
  }
}

module.exports = PaymentController;
