<div align="center">

# ⚙ core-api-server

**A multi-project Node.js & Express backend API connected to MongoDB Atlas for Telegram Mini-Apps, bots, and web utilities.**

</div>
  
---

## 🚀 Features

- **Keep-Alive Ready:** Built-in `/` health check endpoint for Cron-Job.org monitoring to prevent Render server sleep.
- **MongoDB Atlas Integration:** Connects once and shares database collections across multiple mini-apps.
- **Potato Tap Game Endpoints:** Full user management, referral handling, and batch tap synchronization.

---

## 🛠️ Environment Variables

Set the following environment variable on your hosting platform (Render):

| Variable | Description |
| :--- | :--- |
| `MONGODB_URI` | Your MongoDB Atlas connection string (`mongodb+srv://...`) |
| `PORT` | (Optional) Port number for Express server (Defaults to `3000`) |

---

## 📡 API Endpoints

### General
- `GET /` - Health check route for 24/7 uptime monitoring.

### Potato Tap Game (`/api/potato`)
- `POST /api/potato/user` - Fetch or create user profile & credit referrals.
  ```json
  {
    "user": { "id": 12345678, "first_name": "Risvan", "username": "MrBoss002" },
    "refBy": "87654321"
  }
  ```

- `POST /api/potato/sync` - Batch update taps or claim social tasks.

```json
{
  "telegramId": 12345678,
  "taps": 25,
  "claimedTaskId": "tg_join"
}
```

---

### 📄 License
This project is licensed under the MIT License.

---

<div align="center">
  
## ☕ Support & Community

If this project saved you time or helped manage your Telegram channels, consider supporting the developer!

| ☕ Support Developer | 🌐 Official Channel | ⛑ Need Assistance |
| :---: | :---: | :---: |
| [![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20A%20Coffee-FFDD00?style=for-the-badge&logo=buy-me-a-coffee&logoColor=black)](https://www.buymeacoffee.com/MrBoss002) | [![Powered By](https://img.shields.io/badge/Powered%20By-%40MrBossTG-FF0055?style=for-the-badge&logo=telegram&logoColor=blue)](https://t.me/MrBossTG) | [![Dev Help](https://img.shields.io/badge/Contact-Developer-229ED9?style=for-the-badge&logo=telegram&logoColor=blue)](https://t.me/ZeroTwoCare) |

<br />

[![Developed By](https://img.shields.io/badge/Developed%20By-%40MrBoss002-00C853?style=flat-square&logo=github)](https://github.com/MrBoss002)

**Auto-Caption-V2** • Built with ❤️ for Telegram content creators.

</div>
