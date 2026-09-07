const express = require('express');
const cors = require('cors');
const { MongoClient } = require('mongodb');

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI;
const BOT_TOKEN = process.env.BOT_TOKEN; // Needed for Telegram Channel Force-Sub check

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

    const userId = parseInt(user.id);
    const users = db.collection('potato_users');
    let userData = await users.findOne({ telegramId: userId });

    const defaultUpgrades = {
      autobot: { level: 0, cost: 1000 },
      multitap: { level: 1, cost: 500 },
      maxenergy: { level: 0, cost: 250 }
    };

    const now = Date.now();

    if (!userData) {
      const parsedRefBy = refBy ? parseInt(refBy) : null;

      userData = {
        telegramId: userId,
        firstName: user.first_name || 'Player',
        username: user.username || '',
        balance: 0,
        energy: 1000,
        maxEnergy: 1000,
        lastEnergyUpdate: now,
        tapPower: 1,
        autoBotIncome: 0,
        upgrades: defaultUpgrades,
        referredBy: parsedRefBy !== userId ? parsedRefBy : null,
        completedTasks: [],
        createdAt: new Date()
      };
      await users.insertOne(userData);

      // Award bonus points for referrer
      if (parsedRefBy && parsedRefBy !== userId) {
        await users.updateOne(
          { telegramId: parsedRefBy },
          { 
            $inc: { balance: 5000 } 
          }
        );
      }
    } else {
      // Ensure upgrades object structure exists
      if (!userData.upgrades) userData.upgrades = defaultUpgrades;

      // Calculate offline energy regeneration (1 unit per second up to maxEnergy)
      const maxEnergy = userData.maxEnergy || 1000;
      const lastUpdate = userData.lastEnergyUpdate || now;
      const elapsedSeconds = Math.floor((now - lastUpdate) / 1000);
      const regeneratedEnergy = Math.min(maxEnergy, (userData.energy !== undefined ? userData.energy : maxEnergy) + elapsedSeconds);

      userData.energy = regeneratedEnergy;
      userData.lastEnergyUpdate = now;

      // Sync latest profile information from Telegram
      await users.updateOne(
        { telegramId: userId },
        { 
          $set: { 
            firstName: user.first_name || userData.firstName,
            username: user.username || userData.username,
            energy: regeneratedEnergy,
            lastEnergyUpdate: now
          } 
        }
      );
    }

    // Retrieve list of invited friends
    const referredUsers = await users.find(
      { referredBy: userId },
      { projection: { firstName: 1, username: 1, createdAt: 1, _id: 0 } }
    ).toArray();

    const referrals = referredUsers.map(ref => ({
      first_name: ref.firstName,
      username: ref.username
    }));

    res.status(200).json({
      ...userData,
      referrals,
      referralCount: referredUsers.length
    });
  } catch (err) {
    console.error('Error in /api/potato/user:', err);
    res.status(500).json({ error: err.message });
  }
});

// 3. Potato Game: Batch Sync Taps, Task Claims, Upgrades & Energy
app.post('/api/potato/sync', async (req, res) => {
  try {
    if (!db) return res.status(500).json({ error: 'Database not connected' });

    const { telegramId, taps, claimedTaskId, balance, energy, maxEnergy, upgrades, tapPower, autoBotIncome } = req.body;
    if (!telegramId) return res.status(400).json({ error: 'Telegram ID required' });

    const userId = parseInt(telegramId);
    const users = db.collection('potato_users');
    const updateFields = { lastEnergyUpdate: Date.now() };

    if (balance !== undefined) updateFields.balance = balance;
    if (energy !== undefined) updateFields.energy = energy;
    if (maxEnergy !== undefined) updateFields.maxEnergy = maxEnergy;
    if (upgrades) updateFields.upgrades = upgrades;
    if (tapPower !== undefined) updateFields.tapPower = tapPower;
    if (autoBotIncome !== undefined) updateFields.autoBotIncome = autoBotIncome;

    if (taps && taps > 0) {
      await users.updateOne(
        { telegramId: userId },
        { 
          $inc: { balance: taps },
          $set: updateFields
        }
      );
    } else {
      await users.updateOne(
        { telegramId: userId },
        { $set: updateFields }
      );
    }

    if (claimedTaskId) {
      const user = await users.findOne({ telegramId: userId });
      if (user && !user.completedTasks.includes(claimedTaskId)) {
        await users.updateOne(
          { telegramId: userId },
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

// 4. Potato Game: Force-Sub Channel Membership Check
app.post('/api/potato/check-fsub', async (req, res) => {
  try {
    const { telegramId, channelUsername } = req.body;
    if (!BOT_TOKEN) return res.status(500).json({ error: 'BOT_TOKEN is missing on server.' });

    const tgRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getChatMember?chat_id=${channelUsername}&user_id=${telegramId}`);
    const data = await tgRes.json();

    if (data.ok && ['member', 'administrator', 'creator'].includes(data.result.status)) {
      return res.status(200).json({ joined: true });
    } else {
      return res.status(200).json({ joined: false });
    }
  } catch (err) {
    console.error('Error in /api/potato/check-fsub:', err);
    res.status(500).json({ error: err.message });
  }
});

// 5. Potato Game: Global Balance Leaderboard Endpoint
app.get('/api/potato/leaderboard', async (req, res) => {
  try {
    if (!db) return res.status(500).json({ error: 'Database not connected' });

    const telegramId = parseInt(req.query.telegramId);
    const users = db.collection('potato_users');

    // Fetch Top 10 by total balance
    const top10Docs = await users
      .find({})
      .sort({ balance: -1 })
      .limit(10)
      .project({ telegramId: 1, firstName: 1, username: 1, balance: 1, _id: 0 })
      .toArray();

    const top10 = top10Docs.map(u => ({
      telegramId: u.telegramId,
      first_name: u.firstName,
      username: u.username,
      balance: u.balance || 0
    }));

    // Calculate position for current user
    let userRank = { rank: null, balance: 0 };
    if (telegramId) {
      const currentUser = await users.findOne({ telegramId });
      if (currentUser) {
        const higherRankCount = await users.countDocuments({
          balance: { $gt: currentUser.balance || 0 }
        });

        userRank = {
          rank: higherRankCount + 1,
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

// Start Server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
