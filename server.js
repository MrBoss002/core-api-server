const express = require('express');
const cors = require('cors');
const { MongoClient } = require('mongodb');

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI;
const ADMIN_IDS = (process.env.ADMIN_TELEGRAM_IDS || '').split(',').map(id => parseInt(id.trim())).filter(Boolean);

let db;

// Connect to MongoDB Atlas
if (MONGODB_URI) {
  MongoClient.connect(MONGODB_URI)
    .then(client => {
      db = client.db('CoreDatabase');
      console.log('Successfully connected to MongoDB Atlas');
    })
    .catch(err => console.error('MongoDB Connection Error:', err));
} else {
  console.warn('Warning: MONGODB_URI environment variable is missing.');
}

// Admin Authorization Middleware
const authorizeAdmin = (req, res, next) => {
  const adminId = parseInt(req.headers['x-admin-id'] || req.body?.adminId || req.query?.adminId);
  if (!adminId || !ADMIN_IDS.includes(adminId)) {
    return res.status(403).json({ error: 'Unauthorized: Admin access required.' });
  }
  next();
};

// 1. Health-Check Endpoint for Cron-Job.org (Keeps Render awake 24/7)
app.get('/', (req, res) => {
  res.status(200).send('Core API Server is running smoothly! 🚀');
});

// 2. Potato Game: Initialize / Fetch User Profile & Referral List
app.post('/api/potato/user', async (req, res) => {
  try {
    if (!db) return res.status(500).json({ error: 'Database not connected' });

    const { user, refBy } = req.body;
    if (!user || !user.id) return res.status(400).json({ error: 'Invalid user data' });

    const users = db.collection('potato_users');
    let userData = await users.findOne({ telegramId: user.id });

    if (!userData) {
      userData = {
        telegramId: user.id,
        firstName: user.first_name || 'Player',
        username: user.username || '',
        balance: 0,
        energy: 1000,
        maxEnergy: 1000,
        referredBy: refBy ? parseInt(refBy) : null,
        weeklyReferrals: 0,
        completedTasks: [],
        createdAt: new Date()
      };
      await users.insertOne(userData);

      // Award bonus points and increment weekly referrals for referrer
      if (refBy && parseInt(refBy) !== user.id) {
        await users.updateOne(
          { telegramId: parseInt(refBy) },
          { 
            $inc: { 
              balance: 5000,
              weeklyReferrals: 1
            } 
          }
        );
      }
    } else {
      // Sync latest profile information from Telegram
      await users.updateOne(
        { telegramId: user.id },
        { 
          $set: { 
            firstName: user.first_name || userData.firstName,
            username: user.username || userData.username 
          } 
        }
      );
    }

    // Retrieve list of invited friends
    const referredUsers = await users.find(
      { referredBy: user.id },
      { projection: { firstName: 1, username: 1, createdAt: 1, _id: 0 } }
    ).toArray();

    const referrals = referredUsers.map(ref => ({
      first_name: ref.firstName,
      username: ref.username
    }));

    res.status(200).json({
      ...userData,
      referrals
    });
  } catch (err) {
    console.error('Error in /api/potato/user:', err);
    res.status(500).json({ error: err.message });
  }
});

// 3. Potato Game: Batch Sync Taps & Task Claims
app.post('/api/potato/sync', async (req, res) => {
  try {
    if (!db) return res.status(500).json({ error: 'Database not connected' });

    const { telegramId, taps, claimedTaskId } = req.body;
    if (!telegramId) return res.status(400).json({ error: 'Telegram ID required' });

    const users = db.collection('potato_users');

    if (taps && taps > 0) {
      await users.updateOne(
        { telegramId: parseInt(telegramId) },
        { $inc: { balance: taps } }
      );
    } 
    
    if (claimedTaskId) {
      const user = await users.findOne({ telegramId: parseInt(telegramId) });
      if (user && !user.completedTasks.includes(claimedTaskId)) {
        await users.updateOne(
          { telegramId: parseInt(telegramId) },
          { 
            $push: { completedTasks: claimedTaskId },
            $inc: { balance: 2500 }
          }
        );
      }
    }

    res.status(200).json({ success: true });
  } catch (err) {
    console.error('Error in /api/potato/sync:', err);
    res.status(500).json({ error: err.message });
  }
});

// 4. Potato Game: Weekly Leaderboard Endpoint
app.get('/api/potato/leaderboard', async (req, res) => {
  try {
    if (!db) return res.status(500).json({ error: 'Database not connected' });

    const telegramId = parseInt(req.query.telegramId);
    const users = db.collection('potato_users');

    // Fetch Top 10 by weekly referrals, secondary sort by total balance
    const top10Docs = await users
      .find({})
      .sort({ weeklyReferrals: -1, balance: -1 })
      .limit(10)
      .project({ telegramId: 1, firstName: 1, username: 1, weeklyReferrals: 1, balance: 1, _id: 0 })
      .toArray();

    const top10 = top10Docs.map(u => ({
      telegramId: u.telegramId,
      first_name: u.firstName,
      username: u.username,
      weeklyReferrals: u.weeklyReferrals || 0,
      balance: u.balance || 0
    }));

    // Calculate position for current user
    let userRank = { rank: null, weeklyReferrals: 0 };
    if (telegramId) {
      const currentUser = await users.findOne({ telegramId });
      if (currentUser) {
        const higherRankCount = await users.countDocuments({
          $or: [
            { weeklyReferrals: { $gt: currentUser.weeklyReferrals || 0 } },
            { 
              weeklyReferrals: currentUser.weeklyReferrals || 0, 
              balance: { $gt: currentUser.balance || 0 } 
            }
          ]
        });

        userRank = {
          rank: higherRankCount + 1,
          weeklyReferrals: currentUser.weeklyReferrals || 0,
          balance: currentUser.balance || 0
        };
      }
    }

    res.status(200).json({ top10, userRank });
  } catch (err) {
    console.error('Error in /api/potato/leaderboard:', err);
    res.status(500).json({ error: err.message });
  }
});

// --- ADMIN DASHBOARD ROUTES ---

// 5. Admin: Fetch Global Platform Analytics
app.get('/api/admin/stats', authorizeAdmin, async (req, res) => {
  try {
    if (!db) return res.status(500).json({ error: 'Database not connected' });

    const users = db.collection('potato_users');
    const totalUsers = await users.countDocuments();
    
    const balanceStats = await users.aggregate([
      { $group: { _id: null, totalBalance: { $sum: '$balance' } } }
    ]).toArray();

    const activeReferrers = await users.countDocuments({ weeklyReferrals: { $gt: 0 } });

    res.status(200).json({
      totalUsers,
      totalBalance: balanceStats[0]?.totalBalance || 0,
      activeReferrers
    });
  } catch (err) {
    console.error('Error in /api/admin/stats:', err);
    res.status(500).json({ error: err.message });
  }
});

// 6. Admin: Reset Weekly Referral Leaderboard
app.post('/api/admin/reset-weekly', authorizeAdmin, async (req, res) => {
  try {
    if (!db) return res.status(500).json({ error: 'Database not connected' });

    const users = db.collection('potato_users');
    const result = await users.updateMany({}, { $set: { weeklyReferrals: 0 } });

    res.status(200).json({ 
      success: true, 
      message: `Reset weekly referrals for ${result.modifiedCount} users.` 
    });
  } catch (err) {
    console.error('Error in /api/admin/reset-weekly:', err);
    res.status(500).json({ error: err.message });
  }
});

// Start Server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
