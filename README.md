# Kyraxx Admin Panel

A secure Node.js/Express admin panel for managing game client instances remotely.

## Features

- **JWT Authentication**: Secure login for admins only
- **Client Tracking**: Real-time heartbeat and status monitoring
- **Remote Kill**: Terminate specific clients or all clients at once
- **Live Dashboard**: See active clients, their status, and last seen time

## Local Setup

```bash
npm install
npm start
```

Server runs on `http://localhost:5173` (or PORT env var).

## Environment Variables

- `PORT`: Server port (default: 5173)
- `JWT_SECRET`: Secret key for JWT signing (change this!)
- `ADMIN_USER`: Admin username (default: admin)
- `ADMIN_PASS`: Admin password (default: admin)

## API Endpoints

### Public (Client)
- `POST /api/heartbeat`: Client sends status
- `GET /api/kill`: Client polls kill directive

### Protected (Admin, requires JWT)
- `POST /api/login`: Login and get token
- `GET /api/clients`: List all clients
- `POST /api/kill`: Set kill directive
- `POST /api/kill/clear`: Clear kill directive

## Railway Deployment

1. Push to GitHub
2. Create Railway service from GitHub repo
3. Set root directory to `AdminPanel`
4. Set environment variables:
   - `JWT_SECRET`: Strong random string
   - `ADMIN_USER`: Your admin username
   - `ADMIN_PASS`: Your strong password
5. Deploy

Railway will assign a public HTTPS URL.

## Client Integration

In your C# app, set:
```csharp
Config.AdminBaseUrl = "https://your-railway-app.up.railway.app";
```

The client will auto-send heartbeat and poll kill directives.
