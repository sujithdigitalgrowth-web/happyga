require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const callsRouter = require('./src/routes/calls.routes');

const app = express();
const PORT = Number(process.env.PORT) || 3001;

app.use(cors({
  origin: (origin, cb) => cb(null, true),
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.options('/{*path}', cors());

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (_, res) => res.json({ status: 'ok' }));
app.use('/api/call', callsRouter);

app.listen(PORT, () => console.log(`Call server running on http://localhost:${PORT}`));
