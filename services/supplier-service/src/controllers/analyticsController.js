const { query } = require('../database/connection');
const logger = require('../utils/logger');
const { ValidationError } = require('../middleware/errorHandler');

class AnalyticsController {
  /**
   * Get supplier dashboard overview
   */
  static async getDashboardOverview(req, res) {
    const supplierId = req.user.id;
    const { period = '30d' } = req.query;

    try {
      // Calculate date range based on period
      let dateFilter = '';
      switch (period) {
        case '7d':
          dateFilter = "AND created_at >= CURRENT_DATE - INTERVAL '7 days'";
          break;
        case '30d':
          dateFilter = "AND created_at >= CURRENT_DATE - INTERVAL '30 days'";
          break;
        case '90d':
          dateFilter = "AND created_at >= CURRENT_DATE - INTERVAL '90 days'";
          break;
        case '1y':
          dateFilter = "AND created_at >= CURRENT_DATE - INTERVAL '1 year'";
          break;
        default:
          dateFilter = "AND created_at >= CURRENT_DATE - INTERVAL '30 days'";
      }

      // Get inventory statistics
      const inventoryStats = await query(`
        SELECT 
          COUNT(*) as total_items,
          SUM(quantity_available) as total_quantity,
          SUM(CASE WHEN quantity_available <= reorder_level THEN 1 ELSE 0 END) as low_stock_items,
          AVG(unit_cost) as avg_unit_cost
        FROM supplier.inventory 
        WHERE supplier_id = $1
      `, [supplierId]);

      // Get pricing rules statistics
      const pricingStats = await query(`
        SELECT 
          COUNT(*) as total_pricing_rules,
          COUNT(CASE WHEN is_active = true THEN 1 END) as active_pricing_rules,
          AVG(base_price) as avg_base_price,
          COUNT(CASE WHEN discount_percentage IS NOT NULL THEN 1 END) as discounted_rules
        FROM supplier.pricing_rules 
        WHERE supplier_id = $1
      `, [supplierId]);

      // Get bundles statistics
      const bundlesStats = await query(`
        SELECT 
          COUNT(*) as total_bundles,
          COUNT(CASE WHEN is_active = true THEN 1 END) as active_bundles,
          SUM(current_usage_count) as total_bundle_usage,
          AVG(discount_value) as avg_discount_value
        FROM bundles.promotional_bundles 
        WHERE supplier_id = $1
      `, [supplierId]);

      // Get recent transactions
      const transactionStats = await query(`
        SELECT 
          COUNT(*) as total_transactions,
          SUM(amount) as total_revenue,
          AVG(amount) as avg_transaction_value,
          COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_transactions
        FROM payments.transactions 
        WHERE user_id = $1 AND type = 'payment' ${dateFilter}
      `, [supplierId]);

      // Get wallet balance
      const walletStats = await query(`
        SELECT 
          COALESCE(SUM(balance), 0) as total_balance
        FROM payments.wallets 
        WHERE user_id = $1
      `, [supplierId]);

      // Get recent activity trends (daily data for charts)
      const activityTrends = await query(`
        SELECT 
          DATE(created_at) as date,
          COUNT(*) as transaction_count,
          SUM(amount) as daily_revenue
        FROM payments.transactions 
        WHERE user_id = $1 AND type = 'payment' ${dateFilter}
        GROUP BY DATE(created_at)
        ORDER BY date DESC
        LIMIT 30
      `, [supplierId]);

      const overview = {
        period,
        inventory: {
          totalItems: parseInt(inventoryStats.rows[0]?.total_items || 0),
          totalQuantity: parseInt(inventoryStats.rows[0]?.total_quantity || 0),
          lowStockItems: parseInt(inventoryStats.rows[0]?.low_stock_items || 0),
          avgUnitCost: parseFloat(inventoryStats.rows[0]?.avg_unit_cost || 0)
        },
        pricing: {
          totalRules: parseInt(pricingStats.rows[0]?.total_pricing_rules || 0),
          activeRules: parseInt(pricingStats.rows[0]?.active_pricing_rules || 0),
          avgBasePrice: parseFloat(pricingStats.rows[0]?.avg_base_price || 0),
          discountedRules: parseInt(pricingStats.rows[0]?.discounted_rules || 0)
        },
        bundles: {
          totalBundles: parseInt(bundlesStats.rows[0]?.total_bundles || 0),
          activeBundles: parseInt(bundlesStats.rows[0]?.active_bundles || 0),
          totalUsage: parseInt(bundlesStats.rows[0]?.total_bundle_usage || 0),
          avgDiscountValue: parseFloat(bundlesStats.rows[0]?.avg_discount_value || 0)
        },
        transactions: {
          totalTransactions: parseInt(transactionStats.rows[0]?.total_transactions || 0),
          totalRevenue: parseFloat(transactionStats.rows[0]?.total_revenue || 0),
          avgTransactionValue: parseFloat(transactionStats.rows[0]?.avg_transaction_value || 0),
          completedTransactions: parseInt(transactionStats.rows[0]?.completed_transactions || 0),
          successRate: transactionStats.rows[0]?.total_transactions > 0 
            ? ((parseInt(transactionStats.rows[0]?.completed_transactions || 0) / parseInt(transactionStats.rows[0]?.total_transactions)) * 100).toFixed(2)
            : 0
        },
        wallet: {
          totalBalance: parseFloat(walletStats.rows[0]?.total_balance || 0)
        },
        trends: activityTrends.rows.map(row => ({
          date: row.date,
          transactionCount: parseInt(row.transaction_count),
          dailyRevenue: parseFloat(row.daily_revenue)
        }))
      };

      res.json({
        overview,
        generatedAt: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Failed to get dashboard overview:', {
        error: error.message,
        supplierId,
        period
      });
      throw error;
    }
  }

  /**
   * Get inventory analytics
   */
  static async getInventoryAnalytics(req, res) {
    const supplierId = req.user.id;

    try {
      // Get inventory by gas type
      const inventoryByGasType = await query(`
        SELECT 
          gt.name as gas_type_name,
          gt.category,
          COUNT(i.id) as item_count,
          SUM(i.quantity_available) as total_quantity,
          AVG(i.unit_cost) as avg_unit_cost,
          SUM(i.quantity_available * i.unit_cost) as total_value
        FROM supplier.inventory i
        JOIN orders.gas_types gt ON i.gas_type_id = gt.id
        WHERE i.supplier_id = $1
        GROUP BY gt.id, gt.name, gt.category
        ORDER BY total_value DESC
      `, [supplierId]);

      // Get low stock alerts
      const lowStockItems = await query(`
        SELECT 
          i.*,
          gt.name as gas_type_name,
          gt.category
        FROM supplier.inventory i
        JOIN orders.gas_types gt ON i.gas_type_id = gt.id
        WHERE i.supplier_id = $1
        AND i.quantity_available <= i.reorder_level
        ORDER BY (i.quantity_available::float / NULLIF(i.reorder_level, 0)) ASC
      `, [supplierId]);

      // Get inventory turnover (mock data for now)
      const turnoverAnalysis = await query(`
        SELECT 
          i.cylinder_size,
          COUNT(*) as item_count,
          AVG(i.quantity_available) as avg_stock_level,
          SUM(i.quantity_available * i.unit_cost) as total_value
        FROM supplier.inventory i
        WHERE i.supplier_id = $1
        GROUP BY i.cylinder_size
        ORDER BY total_value DESC
      `, [supplierId]);

      res.json({
        inventoryByGasType: inventoryByGasType.rows.map(row => ({
          gasTypeName: row.gas_type_name,
          category: row.category,
          itemCount: parseInt(row.item_count),
          totalQuantity: parseInt(row.total_quantity),
          avgUnitCost: parseFloat(row.avg_unit_cost),
          totalValue: parseFloat(row.total_value)
        })),
        lowStockItems: lowStockItems.rows.map(row => ({
          id: row.id,
          gasTypeName: row.gas_type_name,
          category: row.category,
          cylinderSize: row.cylinder_size,
          quantityAvailable: row.quantity_available,
          reorderLevel: row.reorder_level,
          unitCost: parseFloat(row.unit_cost),
          urgencyLevel: row.quantity_available === 0 ? 'critical' : 
                       row.quantity_available <= (row.reorder_level * 0.5) ? 'high' : 'medium'
        })),
        turnoverAnalysis: turnoverAnalysis.rows.map(row => ({
          cylinderSize: row.cylinder_size,
          itemCount: parseInt(row.item_count),
          avgStockLevel: parseFloat(row.avg_stock_level),
          totalValue: parseFloat(row.total_value)
        })),
        generatedAt: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Failed to get inventory analytics:', {
        error: error.message,
        supplierId
      });
      throw error;
    }
  }

  /**
   * Get sales analytics
   */
  static async getSalesAnalytics(req, res) {
    const supplierId = req.user.id;
    const { period = '30d' } = req.query;

    try {
      // Calculate date filter
      let dateFilter = '';
      switch (period) {
        case '7d':
          dateFilter = "AND t.created_at >= CURRENT_DATE - INTERVAL '7 days'";
          break;
        case '30d':
          dateFilter = "AND t.created_at >= CURRENT_DATE - INTERVAL '30 days'";
          break;
        case '90d':
          dateFilter = "AND t.created_at >= CURRENT_DATE - INTERVAL '90 days'";
          break;
        case '1y':
          dateFilter = "AND t.created_at >= CURRENT_DATE - INTERVAL '1 year'";
          break;
        default:
          dateFilter = "AND t.created_at >= CURRENT_DATE - INTERVAL '30 days'";
      }

      // Get revenue trends
      const revenueTrends = await query(`
        SELECT 
          DATE(t.created_at) as date,
          COUNT(*) as transaction_count,
          SUM(t.amount) as daily_revenue,
          AVG(t.amount) as avg_transaction_value
        FROM payments.transactions t
        WHERE t.user_id = $1 AND t.type = 'payment' AND t.status = 'completed' ${dateFilter}
        GROUP BY DATE(t.created_at)
        ORDER BY date ASC
      `, [supplierId]);

      // Get payment method distribution
      const paymentMethods = await query(`
        SELECT 
          pm.type as payment_method,
          COUNT(t.id) as transaction_count,
          SUM(t.amount) as total_amount
        FROM payments.transactions t
        JOIN payments.payment_methods pm ON t.payment_method_id = pm.id
        WHERE t.user_id = $1 AND t.type = 'payment' AND t.status = 'completed' ${dateFilter}
        GROUP BY pm.type
        ORDER BY total_amount DESC
      `, [supplierId]);

      // Get bundle performance
      const bundlePerformance = await query(`
        SELECT 
          pb.name as bundle_name,
          pb.bundle_type,
          pb.discount_type,
          COUNT(bu.id) as usage_count,
          SUM(bu.discount_applied) as total_discount_given,
          AVG(bu.discount_applied) as avg_discount_per_use
        FROM bundles.promotional_bundles pb
        LEFT JOIN bundles.bundle_usage bu ON pb.id = bu.bundle_id ${dateFilter.replace('t.created_at', 'bu.used_at')}
        WHERE pb.supplier_id = $1
        GROUP BY pb.id, pb.name, pb.bundle_type, pb.discount_type
        ORDER BY usage_count DESC
      `, [supplierId]);

      res.json({
        period,
        revenueTrends: revenueTrends.rows.map(row => ({
          date: row.date,
          transactionCount: parseInt(row.transaction_count),
          dailyRevenue: parseFloat(row.daily_revenue),
          avgTransactionValue: parseFloat(row.avg_transaction_value)
        })),
        paymentMethods: paymentMethods.rows.map(row => ({
          paymentMethod: row.payment_method,
          transactionCount: parseInt(row.transaction_count),
          totalAmount: parseFloat(row.total_amount),
          percentage: paymentMethods.rows.length > 0 
            ? ((parseFloat(row.total_amount) / paymentMethods.rows.reduce((sum, r) => sum + parseFloat(r.total_amount), 0)) * 100).toFixed(2)
            : 0
        })),
        bundlePerformance: bundlePerformance.rows.map(row => ({
          bundleName: row.bundle_name,
          bundleType: row.bundle_type,
          discountType: row.discount_type,
          usageCount: parseInt(row.usage_count || 0),
          totalDiscountGiven: parseFloat(row.total_discount_given || 0),
          avgDiscountPerUse: parseFloat(row.avg_discount_per_use || 0)
        })),
        generatedAt: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Failed to get sales analytics:', {
        error: error.message,
        supplierId,
        period
      });
      throw error;
    }
  }
}

module.exports = AnalyticsController;
