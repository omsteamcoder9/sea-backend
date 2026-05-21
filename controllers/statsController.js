// controllers/statsController.js
import Order from '../models/Order.js';
import User from '../models/User.js';
import Product from '../models/productModel.js';
import Cart from '../models/Cart.js';

// 📊 Get comprehensive stats
export const getComprehensiveStats = async (request, reply) => {
  try {
    console.log('📊 Fetching comprehensive stats...');
    
    // Get all counts
    const totalOrders = await Order.countDocuments();
    const totalUsers = await User.countDocuments();
    const totalProducts = await Product.countDocuments();
    const totalCarts = await Cart.countDocuments();
    
    console.log('Counts:', { totalOrders, totalUsers, totalProducts, totalCarts });
    
    // Get revenue from completed orders
    const revenueResult = await Order.aggregate([
      { $match: { paymentStatus: 'completed' } },
      { $group: { _id: null, total: { $sum: '$finalAmount' } } }
    ]);
    const totalRevenue = revenueResult[0]?.total || 0;
    
    // Get pending orders
    const pendingOrders = await Order.countDocuments({ orderStatus: 'pending' });
    
    // Get today's orders
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);
    
    const todayOrders = await Order.countDocuments({
      createdAt: { $gte: todayStart, $lte: todayEnd }
    });
    
    // Get today's revenue
    const todayRevenueResult = await Order.aggregate([
      {
        $match: {
          paymentStatus: 'completed',
          createdAt: { $gte: todayStart, $lte: todayEnd }
        }
      },
      { $group: { _id: null, amount: { $sum: '$finalAmount' } } }
    ]);
    const todayRevenue = todayRevenueResult[0]?.amount || 0;
    
    // Get low stock products
    const lowStockProducts = await Product.find({ stock: { $lt: 10 } })
      .sort({ stock: 1 })
      .limit(10)
      .select('name stock price sNo');
    const lowStockCount = lowStockProducts.length;
    
    // Get order status breakdown
    const orderStatusStats = await Order.aggregate([
      { $group: { _id: '$orderStatus', count: { $sum: 1 } } }
    ]);
    
    const statusBreakdown = {};
    orderStatusStats.forEach(stat => {
      statusBreakdown[stat._id || 'unknown'] = stat.count;
    });
    
    // Get payment method stats
    const paymentStats = await Order.aggregate([
      {
        $group: {
          _id: '$paymentMethod',
          count: { $sum: 1 },
          totalAmount: { $sum: '$finalAmount' }
        }
      }
    ]);
    
    const paymentData = {};
    paymentStats.forEach(stat => {
      paymentData[stat._id || 'unknown'] = {
        count: stat.count,
        totalAmount: stat.totalAmount
      };
    });
    
    // Get recent orders
    const recentOrders = await Order.find({
      createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
    })
      .sort({ createdAt: -1 })
      .limit(10)
      .populate('user', 'name email phoneNumber')
      .select('orderId finalAmount orderStatus createdAt paymentMethod');
    
    // Get monthly revenue trend (last 6 months)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    
    const monthlyRevenue = await Order.aggregate([
      {
        $match: {
          paymentStatus: 'completed',
          createdAt: { $gte: sixMonthsAgo }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' }
          },
          revenue: { $sum: '$finalAmount' },
          orders: { $sum: 1 }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } }
    ]);
    
    // Get user registration trend (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const userRegistrations = await User.aggregate([
      {
        $match: { createdAt: { $gte: thirtyDaysAgo } }
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);
    
    // Calculate average order value
    const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;
    
    // CONSTRUCT THE RESPONSE OBJECT
    const stats = {
      overview: {
        totalOrders: totalOrders || 0,
        totalUsers: totalUsers || 0,
        totalProducts: totalProducts || 0,
        totalCarts: totalCarts || 0,
        todayOrders: todayOrders || 0,
        todayRevenue: todayRevenue || 0
      },
      financial: {
        totalRevenue: totalRevenue || 0,
        averageOrderValue: Math.round(avgOrderValue * 100) / 100,
        maxOrderValue: 0,
        minOrderValue: 0,
        monthlyRevenueTrend: monthlyRevenue
      },
      orders: {
        statusBreakdown: statusBreakdown,
        paymentMethods: paymentData,
        recentOrders: recentOrders,
        pendingOrders: pendingOrders || 0,
        ordersLast7Days: recentOrders.length
      },
      products: {
        lowStock: lowStockProducts,
        lowStockCount: lowStockCount || 0
      },
      users: {
        registrationTrend: userRegistrations,
        totalActiveUsers: totalUsers
      },
      timestamp: new Date().toISOString()
    };
    
    console.log('✅ Sending stats with:', {
      totalOrders: stats.overview.totalOrders,
      totalUsers: stats.overview.totalUsers,
      totalRevenue: stats.financial.totalRevenue
    });
    
    return reply.status(200).send({
      success: true,
      data: stats,
      message: 'Stats retrieved successfully'
    });
    
  } catch (error) {
    console.error('❌ Stats endpoint error:', error);
    return reply.status(500).send({
      success: false,
      message: 'Error fetching statistics',
      error: error.message
    });
  }
};

// 📈 Get simplified dashboard stats (for widgets)
export const getDashboardStats = async (request, reply) => {
  try {
    console.log('📊 Fetching dashboard stats...');
    
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);
    
    const [
      totalOrders,
      totalRevenueAgg,
      totalUsers,
      pendingOrders,
      todayOrders,
      lowStockCount
    ] = await Promise.all([
      Order.countDocuments(),
      Order.aggregate([
        { $match: { paymentStatus: 'completed' } },
        { $group: { _id: null, total: { $sum: '$finalAmount' } } }
      ]),
      User.countDocuments(),
      Order.countDocuments({ orderStatus: 'pending' }),
      Order.countDocuments({
        createdAt: { $gte: todayStart, $lte: todayEnd }
      }),
      Product.countDocuments({ stock: { $lt: 10 } })
    ]);
    
    const totalRevenue = totalRevenueAgg[0]?.total || 0;
    
    const dashboardData = {
      totalOrders: totalOrders || 0,
      totalRevenue: totalRevenue || 0,
      totalUsers: totalUsers || 0,
      pendingOrders: pendingOrders || 0,
      todayOrders: todayOrders || 0,
      lowStockCount: lowStockCount || 0
    };
    
    console.log('📤 Dashboard data:', dashboardData);
    
    return reply.status(200).send({
      success: true,
      data: dashboardData,
      message: 'Dashboard stats retrieved successfully'
    });
    
  } catch (error) {
    console.error('❌ Dashboard stats error:', error);
    return reply.status(500).send({
      success: false,
      message: 'Error fetching dashboard stats',
      error: error.message
    });
  }
};

// 📊 Get sales analytics with date range
export const getSalesAnalytics = async (request, reply) => {
  try {
    const { startDate, endDate } = request.query;
    
    let dateFilter = {};
    if (startDate && endDate) {
      dateFilter.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    } else {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      dateFilter.createdAt = { $gte: thirtyDaysAgo };
    }
    
    const salesData = await Order.aggregate([
      {
        $match: {
          ...dateFilter,
          paymentStatus: 'completed'
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
          },
          revenue: { $sum: '$finalAmount' },
          orders: { $sum: 1 },
          averageOrderValue: { $avg: '$finalAmount' }
        }
      },
      { $sort: { _id: 1 } }
    ]);
    
    return reply.status(200).send({
      success: true,
      data: salesData,
      message: 'Sales analytics retrieved successfully'
    });
    
  } catch (error) {
    console.error('❌ Sales analytics error:', error);
    return reply.status(500).send({
      success: false,
      message: 'Error fetching sales analytics',
      error: error.message
    });
  }
};

// 👥 Get user analytics
export const getUserAnalytics = async (request, reply) => {
  try {
    const [userStats, userRegistrations] = await Promise.all([
      User.aggregate([
        { $group: { _id: '$role', count: { $sum: 1 } } }
      ]),
      User.aggregate([
        {
          $match: {
            createdAt: { $gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) }
          }
        },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            count: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } }
      ])
    ]);
    
    const roleBreakdown = {};
    userStats.forEach(stat => {
      roleBreakdown[stat._id] = stat.count;
    });
    
    return reply.status(200).send({
      success: true,
      data: {
        roleBreakdown,
        totalUsers: (roleBreakdown.user || 0) + (roleBreakdown.admin || 0),
        registrationTrend: userRegistrations
      },
      message: 'User analytics retrieved successfully'
    });
    
  } catch (error) {
    console.error('❌ User analytics error:', error);
    return reply.status(500).send({
      success: false,
      message: 'Error fetching user analytics',
      error: error.message
    });
  }
};