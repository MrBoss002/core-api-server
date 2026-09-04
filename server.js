const express = require('express');
const cors = require('cors');
const { MongoClient } = require('mongodb');

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI;

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

// 2. Potato Game: Initialize / Fetch User Profile
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
        referredBy: refBy || null,
        completedTasks: [],
        createdAt: new Date()
      };
      await users.insertOne(userData);

      // Award bonus points to referrer if valid
      if (refBy && parseInt(refBy) !== user.id) {
        await users.updateOne(
          { telegramId: parseInt(refBy) },
          { $inc: { balance: 5000 } }
        );
      }
    }

    res.status(200).json(userData);
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
      // Check if task already completed
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

// Start Server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
