# Wiegand Ready Quickstart (Final config: 2 readers; 1&3 share, 2&4 share)

## System deps
sudo apt-get update
sudo apt-get install -y build-essential libgpiod-dev gpiod

## Build native helper
cd backend/native && make

## JS deps & dev UI
cd ../../
npm install
npm run dev

## Start backend (GPIO access required)
sudo node backend/server.js

## Test
# Door 1 (Reader A)
curl -sS -X POST http://localhost:3001/api/wiegand/send      -H 'Content-Type: application/json'      -d '{"door":1,"format":26,"facility":123,"card":12345}'

# Door 2 (Reader B)
curl -sS -X POST http://localhost:3001/api/wiegand/send      -H 'Content-Type: application/json'      -d '{"door":2,"format":26,"facility":101,"card":55555}'
