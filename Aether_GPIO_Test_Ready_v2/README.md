# Aether GPIO Test Ready v2

This pack uses **libgpiod tools** (`gpioset`, `gpioget`) matching your manual tests.

## Backend
```bash
cd backend
sudo pkill -9 gpioset || true
sudo fuser -k 3001/tcp || true
npm install
sudo npm run start
# then: curl http://127.0.0.1:3001/api/health
```
Toggle GPIO17:
```bash
curl -X POST http://127.0.0.1:3001/api/gpio/write -H "Content-Type: application/json" -d '{"pin":17,"value":1}'
curl -X POST http://127.0.0.1:3001/api/gpio/write -H "Content-Type: application/json" -d '{"pin":17,"value":0}'
```

## Frontend
```bash
cd frontend
npm install
npm run dev   # http://localhost:5173
```
